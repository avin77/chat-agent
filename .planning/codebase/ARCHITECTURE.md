# Architecture

**Analysis Date:** 2026-02-27

## Pattern Overview

**Overall:** Hybrid Deterministic State Machine + LLM Fallback

The system uses a two-track approach: maid_hire requests follow a deterministic 8-step state machine (`BaseFlow` + `MaidHiringFlow`), while other intents (complaint, helper_reg, general) use pure LLM-based responses with guardrails.

**Key Characteristics:**
- **Dual-path routing** - Intent detection at entry determines whether to use state machine or LLM
- **Narrow, instruction-based LLM prompts** - State machine emits explicit instructions rather than open-ended prompts
- **Multi-layer fallback** - LLM error → template fallback → keyword validation → safety net
- **Session persistence** - Conversation state tracked in Supabase with 4-hour resume window and automatic reset on completion/stale
- **Post-response guardrails** - All LLM output filtered for prices, external links, phone leaks before display

## Layers

**Presentation (Client):**
- Purpose: Chat UI and session management
- Location: `src/components/chat/ChatWidget.tsx`
- Contains: React client component, message history, input handling
- Depends on: Chat API endpoint, localStorage for session IDs
- Used by: Browser, embedded widgets at `src/app/chat/`, `src/app/embed/`

**API Gateway & Orchestration:**
- Purpose: Route requests, detect intent, manage session lifecycle
- Location: `src/app/api/chat/route.ts` (POST endpoint)
- Contains: Intent detection logic, session management, rate limiting
- Depends on: State machine flows, extractors, guardrails, Supabase
- Used by: ChatWidget frontend, admin dashboard

**State Machine Layer (Deterministic):**
- Purpose: Control maid_hire flow with explicit state transitions
- Location: `src/flows/BaseFlow.ts` (abstract), `src/flows/MaidHiringFlow.ts` (concrete)
- Contains: FlowState enum, step definitions, validation logic
- Depends on: Data extractors
- Used by: Route handler for maid_hire intent
- Behavior: Processes user message → extracts slots → transitions state → emits narrow LLM instruction

**Data Extraction & Validation:**
- Purpose: Extract structured fields (phone, location, service_type, etc.) from unstructured text
- Location: `src/extractors/dataExtractor.ts`, `src/extractors/intentDetector.ts`
- Contains: Regex patterns, validators, fuzzy matching (Levenshtein distance), FAQ/backtrack/gibberish detection
- Depends on: None (pure utility)
- Used by: Route handler, state machine

**LLM Integration:**
- Purpose: Generate natural responses for state machine instructions and handle non-maid_hire intents
- Location: `src/app/api/chat/route.ts` (uses `@ai-sdk/google` Gemini model)
- Contains: `generateText()` calls, model configuration, error handling
- Depends on: AI SDK, Gemini API key
- Used by: Route handler
- Behavior: Receives narrow instruction from state machine, generates response matching that instruction

**Safety & Guardrails:**
- Purpose: Post-process LLM output to remove prices, external links, invalid data
- Location: `src/lib/guardrails.ts`
- Contains: applyStrictGuardrails() function with regex filters
- Depends on: None (pure utility)
- Used by: Route handler on all LLM responses

**Persistence Layer:**
- Purpose: Store conversations, leads, logs, session state
- Location: `src/core/db/client.ts` (Supabase client)
- Contains: Database queries for sessions, leads, complaints, general_enquiries, llm_logs tables
- Depends on: Supabase service role key
- Used by: Route handler for session load/save, escalation logging

**Observability:**
- Purpose: Log LLM interactions for debugging and analytics
- Location: `src/lib/llm-logger.ts`
- Contains: LLM interaction logging to Supabase, console logging for development
- Depends on: Supabase
- Used by: Route handler

**Email Escalation:**
- Purpose: Send lead notifications to admin on completion
- Location: `src/lib/email.ts`
- Contains: Nodemailer SMTP configuration, Resend fallback
- Depends on: Gmail credentials or Resend API key
- Used by: Route handler on escalation

## Data Flow

**Maid Hire Flow (State Machine Path):**

1. User sends message → Client captures it in ChatWidget
2. POST to `/api/chat` with messages array + conversation ID
3. Route handler calls `detectIntent()` on full conversation text
4. If intent === 'maid_hire':
   - Load session from Supabase (or create new)
   - Extract all slots using `extractAllSlots()` (regex patterns for phone, location, service_type, etc.)
   - Detect special conditions: FAQ, wrong city, gibberish, backtrack
   - Call `MaidHiringFlow.processMessage()` with session + extracted data
   - State machine returns: new state, collected data, failure type, narrow LLM instruction
   - If attempts >= 3: force escalate with fallback message
   - Build state machine prompt with instruction + collected data so far
   - Call Gemini with **narrow prompt only** (only latest user message, not full history)
   - If LLM fails: use template fallback from `getStepForState()`
   - Apply guardrails to response
   - If response missing expected keywords: append correct question (keyword fallback)
   - Save new state to Supabase
   - If `shouldEscalate` or flow complete: save lead to DB + send email
   - Return response to client

5. Client displays message, stores in localStorage, awaits next input

**Other Intents (LLM-Only Path):**

1. User message → POST to `/api/chat`
2. Route handler detects intent as complaint/helper_reg/general
3. Load or create session (no state machine)
4. Trim message history to last 12 messages (2 oldest + 10 newest)
5. Call Gemini with full prompt from `ENHANCED_PROMPTS[intent]`
6. If LLM fails: use intent-specific fallback template
7. Apply guardrails
8. Check for escalation: phone extracted + LLM `[ESCALATE]` tag
9. If escalating: save to appropriate table (complaints/helper_registrations/general_enquiries)
10. Send email if ADMIN_EMAIL configured
11. Return response to client

**State Management:**

- **Session state:** Stored in Supabase `conversation_sessions` table
  - conversationId (PK)
  - detected_intent (complaint, maid_hire, helper_reg, general)
  - current_state (FlowState for maid_hire, null for others)
  - collected_data (JSON of all extracted fields)
  - attempts (count of invalid attempts)
  - last_activity (timestamp for stale detection)

- **Stale session reset:** After 4 hours of inactivity or >= 3 attempts, session resets to START
- **Session switch:** If user changes intent, session resets and new intent takes over
- **Complete reset:** After flow completes or stuck session, next message starts fresh

## Key Abstractions

**FlowState Enum:**
- Purpose: Define explicit states for maid_hire flow
- Examples: `FlowState.START`, `FlowState.ASK_PHONE`, `FlowState.ASK_LOCATION`, `FlowState.ASK_SERVICE`, `FlowState.ASK_SCHEDULE`, `FlowState.ASK_SALARY`, `FlowState.ASK_FAMILY`, `FlowState.ASK_EXPERIENCE`, `FlowState.COMPLETE`
- Pattern: Deterministic progression; user advances state by satisfying current step validator

**StepDefinition Interface:**
- Purpose: Describe a single question in the flow
- Examples: Phone validation step, location validation step
- Pattern: Each step specifies question text, error message, validator function, nextState
- Files: `src/flows/BaseFlow.ts` line 56-64, `src/flows/MaidHiringFlow.ts` line 52-117

**ProcessResult:**
- Purpose: Return value from state machine `processMessage()` with full context
- Pattern: Contains newState, collectedData, failureType, slotsExtracted, LLM instruction, escalation flags
- Files: `src/flows/BaseFlow.ts` line 67-80, used throughout route.ts

**FailureType Enum:**
- Purpose: Classify why state machine didn't advance or why it needs to re-ask
- Examples: `INVALID_SLOT`, `FAQ_MID_FLOW`, `WRONG_CITY`, `GIBBERISH`, `BACKTRACK`, `MULTI_SLOT`
- Pattern: Each failure type triggers different LLM instruction or fallback message
- Files: `src/flows/BaseFlow.ts` line 17-28

**Extracted Slots:**
- Purpose: Structured data extracted from user message
- Examples: phone, location, service_type, schedule, salary_range, family_size, has_experience, name
- Pattern: Regex-based extraction with validators; used to populate ProcessResult
- Files: `src/extractors/dataExtractor.ts` line 12-21, extraction functions throughout

## Entry Points

**Browser Chat Page:**
- Location: `src/app/chat/page.tsx`, `src/app/page.tsx`
- Triggers: Direct URL navigation
- Responsibilities: Render ChatWidget component

**Chat API Endpoint:**
- Location: `src/app/api/chat/route.ts`
- Triggers: POST request from ChatWidget with messages array
- Responsibilities:
  - Extract latest message and detect intent
  - Load/create session from Supabase
  - Route to state machine (maid_hire) or LLM-only (other intents)
  - Apply guardrails
  - Escalate and email on completion
  - Stream response back via `createUIMessageStream`

**Dashboard:**
- Location: `src/app/dashboard/page.tsx`
- Triggers: Manual URL navigation to /dashboard
- Responsibilities: Display analytics on conversation health, eval metrics, response quality

## Error Handling

**Strategy:** Graceful degradation with multiple fallback layers

**Patterns:**

1. **LLM Call Failure** → Use template fallback from state machine step definitions
   - Files: `src/app/api/chat/route.ts` line 291-329
   - Behavior: If Gemini times out/errors, build response from `getStepForState().question` instead

2. **Empty/Truncated Response** → Safety net with intent-specific fallback
   - Files: `src/app/api/chat/route.ts` line 566-587
   - Behavior: If LLM returns <4 chars or just punctuation, replace with explicit fallback text

3. **Keyword Validation Failure** → Append correct question after wrong one
   - Files: `src/app/api/chat/route.ts` line 341-365
   - Behavior: If response missing keywords for current state, force-append correct question

4. **Session Load Failure** → Create fresh session without prior context
   - Files: `src/app/api/chat/route.ts` line 193-196
   - Behavior: On DB error during session load, create new session and continue

5. **Rate Limit (429)** → Return 429 status with waitMs for client retry
   - Files: `src/app/api/chat/route.ts` line 407-413, 741-742, 765-770
   - Behavior: Client receives 429 and auto-retries after waitMs

6. **Database Errors** → Log to file, continue without blocking response
   - Files: `src/app/api/chat/route.ts` line 113, 189, 229
   - Behavior: All DB errors written to `chat_debug.log`, request continues with in-memory state

## Cross-Cutting Concerns

**Logging:**
- LLM interactions logged to Supabase `llm_logs` table with full conversation context
- File-based debug logging to `chat_debug.log` for session state transitions and errors
- Console logging in development mode shows intent, prompts, raw/cleaned responses
- Files: `src/lib/llm-logger.ts`, `src/app/api/chat/route.ts` line 372-377, 397-398

**Validation:**
- Phone validation: Indian format, 6-9 start, 10 digits
- Location validation: Fuzzy match against Bengaluru area list using Levenshtein distance
- Service type validation: Exact match or substring against predefined list
- Schedule validation: Keyword matching for full-time/part-time/24-hour/12-hour patterns
- Files: `src/extractors/dataExtractor.ts`, `src/flows/MaidHiringFlow.ts` line 28-49

**Authentication:**
- No user authentication required
- Session identified by conversation ID (random UUID generated client-side, stored in localStorage)
- Conversation ID can be overridden via `x-conversation-id` header
- Files: `src/components/chat/ChatWidget.tsx` line 14-28, `src/app/api/chat/route.ts` line 423

**Rate Limiting:**
- Per-minute rate limiting on Gemini API calls
- Tracked in memory by `geminiRateLimiter` singleton
- If limit hit: return 429 status with waitMs
- Files: `src/lib/rateLimiter.ts`, `src/app/api/chat/route.ts` line 407-415

---

*Architecture analysis: 2026-02-27*
