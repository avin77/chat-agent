# Phase 2: Agentic Tool-Calling Flow - Research

**Researched:** 2026-02-28
**Domain:** Vercel AI SDK tool calling, LLM agentic flow, feature-flag routing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tool Set Design**
- 8 tools total: 7 save tools (one per field) + 1 escalate tool
  - `save_phone(phone: string)` — validates via `isValidPhone()`, returns success or error with re-ask instruction
  - `save_location(location: string)` — validates via `validateLocation()`
  - `save_service_type(service_type: string)` — validates via `validateServiceType()`
  - `save_schedule(schedule: string)` — validates via `validateSchedule()`
  - `save_salary_range(salary_range: string)` — optional field, accepts any non-empty value
  - `save_family_size(family_size: string)` — optional field, accepts any non-empty value
  - `save_has_experience(has_experience: string)` — optional field, accepts any non-empty value
  - `escalate()` — used only for mid-flow anger/complaints/urgent human handoff (NOT for normal completion)
- One tool call per turn — LLM never calls multiple tools in one turn
- Validate in each tool — reuse existing validators from `dataExtractor.ts`; if invalid, return `{success: false, error: "Invalid value. Re-ask: '...'"}`
- No `ask_question` tool — LLM generates all conversation text naturally; tools only save data
- No `get_collected_data` tool — state is injected into system prompt each turn
- Normal completion — auto-triggered by `route.ts` when all required fields (phone, location, service_type, schedule) are collected

**Conversation Order & Style**
- Flexible order — LLM decides based on missing fields
- One question per message always — system prompt instructs
- FAQ mid-flow — LLM answers briefly then re-asks the current missing field
- Tone — LLM responds naturally using its own language; no scripted response templates

**Failure & Fallback**
- Failed tool call: validator rejected; counter increments by 1, resets to 0 on any successful call
- 3 consecutive failures → force exit:
  - If phone collected: save partial lead to DB + send email → "Our team will call you at [phone] within 2 hours"
  - If no phone: "Our team is standing by. Call us directly or try again shortly."
- Gemini API error (timeout/500): fall back to `MaidHiringFlow` deterministic handler for that single turn only
- `escalate()` tool: mid-flow only for anger/complaints; fires before phone is collected; triggers human handoff

**Feature Flag & Session Schema**
- `USE_AGENTIC=true` in `.env.local` — server-wide ENV flag, no per-session toggle
- Supabase migration: add `agentic_mode BOOLEAN DEFAULT false` to `conversation_sessions` table
- Eval: `npm run eval:state` with `USE_AGENTIC=true` must pass ≥95%

### Claude's Discretion
- Exact system prompt wording and structure for the agentic handler
- Tool parameter types and JSON schema definitions
- How remaining fields are listed in system prompt (ordered list vs JSON)
- Exact retry messaging for invalid values per field
- Whether `agentic_mode` column is set at session creation or on first agentic turn

### Deferred Ideas (OUT OF SCOPE)
- Dashboard: agentic vs deterministic comparison (Phase 3.1 or Phase 4)
- Per-session A/B toggle (ENV-only sufficient for Phase 2)
- Percentage rollout (`USE_AGENTIC_PERCENT=50`) — deferred to after validation
- Tool call log in Supabase (deferred; would go into llm_logs JSONB or new table)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLOW-01 | `handleMaidHireAgentic()` in `src/flows/agenticMaidHire.ts` implements LLM tool-calling with 8 tools | Tool API section: `tool()` function, `generateText()` with tools parameter, tool result access pattern |
| FLOW-02 | `USE_AGENTIC=true` env var routes maid_hire to agentic handler; false/absent uses deterministic | Feature flag section: `process.env.USE_AGENTIC === 'true'` pattern, route.ts routing pattern |
| FLOW-03 | Agentic flow reads and writes session to Supabase (same `conversation_sessions` schema) | Session schema section: existing `saveStateMachineSession()` pattern, `agentic_mode` column migration |
| FLOW-04 | Agentic flow applies guardrails.ts post-processing | `applyStrictGuardrails()` is a pure function, applied to agentic `text` result same as state machine |
| FLOW-05 | Force-escalate triggered after 3 consecutive failed tool calls | Tool failure counter pattern; `consecutiveFailures` tracked in session or local state |
| FLOW-06 | Fallback to deterministic mode if same tool called 3+ times in one session (loop detection) | Loop detection pattern: count per-tool call frequency in `collected_data` metadata |
</phase_requirements>

---

## Summary

Phase 2 builds `handleMaidHireAgentic()` — an LLM tool-calling handler that replaces the deterministic 8-step state machine for maid_hire sessions. The LLM collects the same 7 fields (phone, location, service_type, schedule, salary_range, family_size, has_experience) but decides collection order dynamically, using tool calls to save each validated field. The entire feature is gated behind `USE_AGENTIC=true` so the deterministic path remains fully intact for rollback.

The project already has `ai@6.0.41` and `@ai-sdk/google@3.0.10` installed. The `generateText()` function with a `tools` parameter is the correct API — no new packages needed. The key API finding is that `ai@6` uses `input` (not `args`) as the tool call argument property on `TypedToolCall`, and both `parameters` and `inputSchema` are accepted as the tool schema property name (tested in the installed version). The critical constraint is one-step execution (no `stopWhen` needed; default `stopWhen: stepCountIs(1)` produces one LLM call → zero or one tool call).

The phase requires one Supabase migration (add `agentic_mode BOOLEAN DEFAULT false` to `conversation_sessions`), one new file (`src/flows/agenticMaidHire.ts`), and a routing addition in `src/app/api/chat/route.ts`. All validators, email sending, Supabase logging, and guardrails reuse existing code with no changes.

**Primary recommendation:** Use `generateText()` with `tools` parameter and default single-step execution (no `stopWhen`). Execute each tool call manually inside `handleMaidHireAgentic()` by inspecting `result.toolCalls[0]` — the LLM calls at most one tool per turn by system prompt instruction.

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.41 | `generateText()` + `tool()` function | Already used; provides typed tool API |
| `@ai-sdk/google` | 3.0.10 | `google('gemma-3-27b-it')` model | Already used for all LLM calls |
| `zod` | 3.24.1 | Tool input schemas | Already used in `llmExtractor.ts` |
| `@supabase/supabase-js` | 2.90.1 | Session persistence | Already used |

### Supporting (already exist in codebase)

| Asset | Location | Purpose |
|-------|----------|---------|
| `isValidPhone()` | `src/extractors/dataExtractor.ts` | Phone validation in `save_phone` tool |
| `validateLocation()` (local in MaidHiringFlow) | `src/flows/MaidHiringFlow.ts` | Location validation — needs re-export or inline copy |
| `validateServiceType()` (local) | `src/flows/MaidHiringFlow.ts` | Service type validation |
| `validateSchedule()` (local) | `src/flows/MaidHiringFlow.ts` | Schedule validation |
| `applyStrictGuardrails()` | `src/lib/guardrails.ts` | Post-process agentic text response |
| `sendEmail()` | `src/lib/email.ts` | Escalation email on completion/force-exit |
| `logLLMInteraction()` | `src/lib/llm-logger.ts` | Log to `llm_logs` table |

**Critical note on validators:** `validateLocation`, `validateServiceType`, `validateSchedule` are currently module-private functions in `MaidHiringFlow.ts`. They need to either be exported from that file or re-declared in `agenticMaidHire.ts`. The simplest approach (Claude's discretion) is to re-declare them inline in `agenticMaidHire.ts` — they are short pure functions.

**No new packages required.** The `tool()` helper from `ai@6` is the only new import.

**Installation:**
```bash
# No installation needed — all dependencies already present
```

---

## Architecture Patterns

### Recommended File Structure

```
src/
├── flows/
│   ├── BaseFlow.ts              # Existing — types/interfaces reused
│   ├── MaidHiringFlow.ts        # Existing — deterministic path unchanged
│   └── agenticMaidHire.ts       # NEW — tool definitions + handleMaidHireAgentic()
├── app/api/chat/
│   └── route.ts                 # Modified — add USE_AGENTIC routing + agentic_mode column write
supabase-migration-phase2.sql    # NEW — adds agentic_mode column
```

### Pattern 1: Tool Definition with `tool()` helper

**What:** Define each save tool as a `tool()` call with `inputSchema` (zod), `description`, and `execute` function. The execute function validates the value, mutates an in-flight `collectedData` object, and returns `{success, error}` for the LLM to read.

**When to use:** For all 7 save tools and 1 escalate tool.

**Example:**
```typescript
// Source: ai@6.0.41 verified by direct runtime test + type inspection
import { tool, generateText } from 'ai';
import { z } from 'zod';
import { isValidPhone } from '../extractors/dataExtractor';

// Tool definition pattern (validated against ai@6.0.41 types)
const save_phone = tool({
  description: 'Save the customer phone number. Call ONLY when the user has provided a 10-digit mobile number.',
  inputSchema: z.object({
    phone: z.string().describe('10-digit Indian mobile number starting with 6-9'),
  }),
  execute: async ({ phone }) => {
    if (!isValidPhone(phone)) {
      return { success: false, error: "Invalid phone number. Re-ask: 'Please share your 10-digit mobile number (e.g., 9876543210).'" };
    }
    return { success: true, field: 'phone', value: phone };
  },
});
```

**CRITICAL API NOTE:** In `ai@6`, the tool result property on `TypedToolCall` is `input` (not `args`). The execute function receives the zod-validated object directly. Both `inputSchema` and `parameters` work as property names in v6.0.41 (tested), but use `inputSchema` to match v6 documentation.

### Pattern 2: Single-Step generateText with Tool Execution

**What:** Call `generateText()` with the tools object. The default `stopWhen: stepCountIs(1)` means the model makes ONE decision: either generate text or call ONE tool. Inspect `result.toolCalls` to find the tool the model chose.

**When to use:** Every agentic turn.

**Example:**
```typescript
// Source: ai@6.0.41 type definitions + official docs at ai-sdk.dev
const result = await generateText({
  model: google('gemma-3-27b-it'),
  tools: {
    save_phone,
    save_location,
    save_service_type,
    save_schedule,
    save_salary_range,
    save_family_size,
    save_has_experience,
    escalate,
  },
  toolChoice: 'auto',    // LLM decides whether to call a tool or just respond
  system: agenticSystemPrompt,
  messages: [{ role: 'user', content: latestMessage }],
  // No stopWhen needed — default is stepCountIs(1), one LLM call per turn
});

// result.toolCalls is typed Array<TypedToolCall<TOOLS>>
// result.toolCalls[0].toolName — name of called tool (if any)
// result.toolCalls[0].input — validated input object
// result.text — LLM text response (may be empty if tool was called)
// result.toolResults[0].output — what execute() returned
```

**One tool call per turn enforcement:** The system prompt instructs "call exactly one tool per message." Additionally, the default single-step execution means the LLM only gets one chance to generate. If `result.toolCalls.length > 1` (unlikely with Gemma but possible), process only `result.toolCalls[0]`.

### Pattern 3: Tool Result Interpretation and collectedData Update

**What:** After `generateText()`, inspect `result.toolResults` to determine if a tool was called and whether it succeeded. Update `collectedData` in the agentic session based on the tool's return value.

**Example:**
```typescript
// Source: ai@6.0.41 type definitions (StaticToolResult has .output property)
let consecutiveFailures = agenticSession.consecutiveFailures ?? 0;
let toolCalled = false;

if (result.toolResults && result.toolResults.length > 0) {
  const toolResult = result.toolResults[0];
  const output = toolResult.output as { success: boolean; error?: string; field?: string; value?: string };
  toolCalled = true;

  if (output.success && output.field && output.value) {
    // Valid slot saved
    agenticSession.collectedData[output.field] = output.value;
    consecutiveFailures = 0;
  } else if (!output.success) {
    // Validator rejected — increment failure counter
    consecutiveFailures += 1;
  }
}

// Determine display text: prefer LLM text, but if tool was called and text is empty,
// fall back to the tool's error message or a state-based prompt
const displayText = result.text?.trim() || (toolCalled ? deriveTextFromTool(result, agenticSession) : 'How can I help you?');
```

### Pattern 4: Feature Flag Routing in route.ts

**What:** Check `process.env.USE_AGENTIC === 'true'` at the maid_hire routing branch. Pattern mirrors existing `DEMO_MODE` check.

**Example:**
```typescript
// Source: Existing DEMO_MODE pattern in route.ts (verified in codebase)
if (intent === 'maid_hire') {
  const useAgentic = process.env.USE_AGENTIC === 'true';

  try {
    const result = useAgentic
      ? await handleMaidHireAgentic(conversationId, latestMessage, coreMessages, dbSession)
      : await handleMaidHireStateMachine(conversationId, latestMessage, coreMessages, dbSession);

    // ... rest of logging/escalation logic identical for both paths
  } catch (err) {
    // If agentic handler throws unexpectedly, fall back to deterministic for this turn
    if (useAgentic) {
      console.error('[Agentic] Unexpected error, falling back:', err);
      // fall back to handleMaidHireStateMachine
    }
  }
}
```

### Pattern 5: Agentic Session State in Supabase

**What:** The agentic handler maps to the same `conversation_sessions` schema. `current_state` stores the "next required field" or `COMPLETE`. `collected_data` holds the 7 slots. `attempts` tracks consecutive failures. `agentic_mode = true` flags the session.

**Supabase session fields used by agentic handler:**
```typescript
// Fields in conversation_sessions used by handleMaidHireAgentic
{
  current_state: string;        // e.g. "NEED_PHONE" or "COMPLETE" or field name
  collected_data: {             // same JSONB shape as deterministic
    phone?: string;
    location?: string;
    service_type?: string;
    schedule?: string;
    salary_range?: string;
    family_size?: string;
    has_experience?: string;
    __consecutive_failures?: string;  // like __confusion in deterministic
  };
  attempts: number;             // total attempts (used for compatible logging)
  agentic_mode: boolean;        // new column — set to true for agentic sessions
}
```

**Note on `current_state` for agentic:** The deterministic handler uses `FlowState` enum values (ASK_PHONE, etc.). The agentic handler doesn't have a rigid state enum — the LLM decides order. Use `current_state` to store the "next missing required field" (e.g., `NEED_PHONE`, `NEED_LOCATION`, or `COMPLETE`) as a string. This keeps Supabase data readable without breaking the dashboard (which queries `current_state`).

### Pattern 6: Completion Detection

**What:** After each tool result, check if all 4 required fields are collected. If yes, trigger escalation (same as deterministic `shouldEscalate = true`).

```typescript
const REQUIRED_FIELDS = ['phone', 'location', 'service_type', 'schedule'];

function isComplete(collectedData: CollectedData): boolean {
  return REQUIRED_FIELDS.every(f => !!collectedData[f as keyof CollectedData]);
}
```

**Critical:** The agentic handler should NOT use the `escalate()` tool for normal completion. Normal completion auto-fires from route.ts when all required fields are present — same as the `shouldEscalate: true` signal from the deterministic handler.

### Pattern 7: FLOW-06 Loop Detection

**What:** Track how many times each tool has been called in a single session. If same tool called 3+ times, fall back to deterministic for remainder of session.

```typescript
// Stored in collected_data as __tool_calls: JSON string of {toolName: count}
function detectToolLoop(collectedData: CollectedData): boolean {
  const toolCallsRaw = (collectedData as any).__tool_calls || '{}';
  const toolCalls: Record<string, number> = JSON.parse(toolCallsRaw);
  return Object.values(toolCalls).some(count => count >= 3);
}
```

**When loop detected:** Set a flag so route.ts routes this session back to deterministic for ALL subsequent turns (or just the current turn, per FLOW-06 spec). Store `__loop_detected: 'true'` in `collected_data` to persist the flag across turns.

### Pattern 8: System Prompt for Agentic Handler (Claude's Discretion)

**Recommended structure:**

```
ROLE: EzyBot — domestic help intake assistant for EzyHelpers.com, Bengaluru.

COLLECTED DATA:
{phone: "9876543210", location: null, service_type: null, schedule: null, salary_range: null, family_size: null, has_experience: null}

STILL NEEDED (required): location, service_type, schedule
STILL NEEDED (optional): salary_range, family_size, has_experience

INSTRUCTIONS:
1. Ask the customer for the NEXT missing required field in a natural, conversational way.
2. When the customer provides information, call the appropriate save_* tool.
3. Call EXACTLY ONE tool per message. Never call multiple tools at once.
4. If the customer provides a field you haven't asked for yet (e.g., they volunteer location before being asked), call the appropriate save_* tool immediately.
5. If a FAQ is asked, answer it briefly, then re-ask the current missing field.
6. If the customer seems angry or wants urgent human help, call escalate().
7. After ALL required fields are collected, thank the customer — do not ask more questions.

RULES:
- Ask one question per message only.
- Never mention prices.
- Never offer to call the customer yourself.
```

**Why ordered list over JSON for remaining fields:** More natural for the LLM to parse; smaller token footprint; easier to add priority (required vs optional).

### Anti-Patterns to Avoid

- **Using `stopWhen: stepCountIs(N)` with N > 1 for per-turn execution:** The agentic loop should be managed in `route.ts` across HTTP requests, not within a single `generateText()` call. Each HTTP request = one LLM call = one potential tool call.
- **Using `toolChoice: 'required'`:** This forces the LLM to call a tool even when it should respond with text (e.g., FAQ answers). Use `'auto'` and let the system prompt guide behavior.
- **Accessing `result.toolCalls[0].args`:** In ai@6, the property is `input`, not `args`. Using `args` will be undefined.
- **Re-running validators in route.ts:** Validators run inside `execute()` in the tool definition. The route.ts handler just reads the `output.success` boolean.
- **Using `generateObject` for the agentic handler:** `generateObject` is deprecated in ai@6 (use `generateText` with `output` setting). The agentic handler should use `generateText` with `tools`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type-safe tool definitions | Custom TypeScript interfaces for tools | `tool()` helper from `ai@6` | Provides end-to-end type inference; inputSchema validates at runtime |
| Tool input validation | Manual JSON parsing and regex in route.ts | Zod schema in `inputSchema` — ai SDK validates before `execute()` runs | AI SDK validates schema before calling execute; malformed inputs never reach execute |
| Multi-step orchestration across HTTP requests | Custom state machine to track agentic progress | Supabase session with `collected_data` JSON | Sessions already exist; each turn is stateless HTTP, state lives in DB |
| Phone validation | New regex in agenticMaidHire.ts | `isValidPhone()` from `src/extractors/dataExtractor.ts` | Battle-tested, already covers Indian phone number edge cases |

**Key insight:** The AI SDK's `tool()` function does schema validation BEFORE calling `execute()`. So `execute()` always receives a structurally valid input. Runtime semantic validation (is this actually a Bengaluru area?) is the responsibility of the execute function, not the inputSchema.

---

## Common Pitfalls

### Pitfall 1: Tool Call Property Named `input` (Not `args`)

**What goes wrong:** Code accesses `result.toolCalls[0].args.phone` → undefined at runtime.
**Why it happens:** Documentation examples from older SDK versions (< v5) used `args`. In ai@6 the TypeScript type is `StaticToolCall.input`.
**How to avoid:** Always use `result.toolCalls[0].input` or read from `result.toolResults[0].output` (the execute() return value — simpler).
**Verification:** `grep -n "input\|args" node_modules/ai/dist/index.d.ts | grep StaticToolCall` → confirms `input` field.

### Pitfall 2: Empty `result.text` When Tool Is Called

**What goes wrong:** Gemma calls a tool and `result.text` is `""`. The handler returns empty string to user.
**Why it happens:** When an LLM calls a tool, it typically returns no text alongside it — the tool call IS the response.
**How to avoid:** If `result.toolCalls.length > 0`, don't use `result.text` as the display text. Instead, derive the display text from the tool's execute() result (e.g., use the `error` message for re-asks, or derive the next question from remaining fields).
**Warning signs:** Users see empty responses in chat.

### Pitfall 3: `toolChoice: 'required'` Causing Infinite Loops

**What goes wrong:** With `toolChoice: 'required'`, the LLM always calls a tool even when it should respond with text (e.g., FAQ answer). This breaks FAQ handling.
**Why it happens:** `required` forces tool call on EVERY generation. The agentic design requires LLM to sometimes respond with text (FAQ answers, error messages).
**How to avoid:** Use `toolChoice: 'auto'` (default). Let the system prompt guide tool usage.

### Pitfall 4: Supabase `attempts` Column Conflict

**What goes wrong:** The agentic handler uses `attempts` to track consecutive validation failures, but the deterministic handler uses `attempts` for overall bad-input count.
**Why it happens:** Schema is shared; semantics differ between handlers.
**How to avoid:** Use a separate `__consecutive_failures` key inside `collected_data` JSONB for the agentic failure counter. Keep `attempts` for general compatibility (increment on any failed turn for dashboard display). This mirrors how `__confusion` works in the deterministic handler.

### Pitfall 5: Forgetting to Set `agentic_mode = true` in Supabase

**What goes wrong:** Dashboard cannot distinguish agentic vs deterministic sessions. FLOW-03 fails.
**Why it happens:** The migration adds the column but nothing writes it.
**How to avoid:** In `handleMaidHireAgentic()`, always write `agentic_mode: true` to `conversation_sessions` on every session save (in the `saveAgenticSession()` helper).

### Pitfall 6: Validators Not Exported from MaidHiringFlow.ts

**What goes wrong:** `validateLocation`, `validateServiceType`, `validateSchedule` are module-private in `MaidHiringFlow.ts`. Importing them from `agenticMaidHire.ts` fails at compile time.
**Why it happens:** They were defined as module-scope functions, not exported.
**How to avoid:** Option A — export them from `MaidHiringFlow.ts` (changes existing file, low risk). Option B — re-declare them in `agenticMaidHire.ts` (no existing file changes). Recommended: Option B (inline copies), since they are 3-5 line pure functions and avoids coupling.

### Pitfall 7: FLOW-06 Loop Detection Firing Too Early

**What goes wrong:** If a user legitimately corrects their phone number 3 times (invalid → invalid → valid), loop detection fires and falls back to deterministic.
**Why it happens:** Tool call count doesn't distinguish "user providing bad data" from "LLM stuck in loop."
**How to avoid:** Only count tool calls where `output.success === true` when implementing FLOW-06, or track TOTAL calls (including failed) but use a higher threshold (5 instead of 3) for loop detection. The spec says "same tool called 3+ times" — this counts ALL calls, so 3 consecutive invalid phone attempts would trigger it. This is acceptable behavior (force escalate is the right outcome after 3 phone failures anyway, via FLOW-05).

### Pitfall 8: Gemma Calling Two Tools in One Generation

**What goes wrong:** The system prompt says "call exactly one tool" but Gemma occasionally violates this.
**Why it happens:** Gemma is an instruction-following model but not perfectly constrained by prompts.
**How to avoid:** After `generateText()`, process only `result.toolCalls[0]` and log a warning if `result.toolCalls.length > 1`. Never process multiple tools from one turn.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### Full Tool Definition (ai@6 verified)

```typescript
// Source: ai@6.0.41 tool() function, tested against installed package
import { tool } from 'ai';
import { z } from 'zod';
import { isValidPhone } from '../extractors/dataExtractor';

const BENGALURU_AREAS = [ /* same list as MaidHiringFlow.ts */ ];

function validateLocation(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return BENGALURU_AREAS.some(area => lower.includes(area)) || lower.length >= 2;
}

export const agenticTools = {
  save_phone: tool({
    description: 'Save the customer phone number when they provide it.',
    inputSchema: z.object({
      phone: z.string().describe('Indian mobile number, 10 digits, starts with 6-9'),
    }),
    execute: async ({ phone }) => {
      if (!isValidPhone(phone.replace(/\D/g, '').slice(-10))) {
        return { success: false, error: "Please share a valid 10-digit mobile number (e.g., 9876543210)." };
      }
      return { success: true, field: 'phone', value: phone.replace(/\D/g, '').slice(-10) };
    },
  }),

  save_location: tool({
    description: 'Save the Bengaluru area or locality when the customer provides it.',
    inputSchema: z.object({
      location: z.string().describe('Bengaluru area or locality name'),
    }),
    execute: async ({ location }) => {
      if (!validateLocation(location)) {
        return { success: false, error: "Please share your area in Bengaluru (e.g., Koramangala, Indiranagar, Whitefield)." };
      }
      return { success: true, field: 'location', value: location };
    },
  }),

  escalate: tool({
    description: 'Escalate to human support when the customer is angry, frustrated, or has a complaint mid-flow.',
    inputSchema: z.object({
      reason: z.string().describe('Brief reason for escalation'),
    }),
    execute: async ({ reason }) => {
      return { success: true, field: '__escalate', value: reason };
    },
  }),
} as const;
```

### generateText Call with Tools

```typescript
// Source: ai@6.0.41 generateText API, verified against type definitions
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const result = await generateText({
  model: google('gemma-3-27b-it'),
  tools: agenticTools,
  toolChoice: 'auto',
  system: buildAgenticSystemPrompt(collectedData, remainingFields),
  messages: [{ role: 'user', content: latestMessage }],
  // Do NOT add stopWhen — default is single-step (one LLM call per turn)
});

// Access results:
// result.text          — LLM text response (may be '' if tool was called)
// result.toolCalls     — Array<TypedToolCall<tools>> — use [0] for first tool
// result.toolResults   — Array with .output from execute()
// result.usage.inputTokens / result.usage.outputTokens / result.usage.totalTokens

// Check if a tool was called
if (result.toolCalls.length > 0) {
  const call = result.toolCalls[0];
  // call.toolName — e.g. 'save_phone'
  // call.input    — zod-validated object, e.g. { phone: '9876543210' }
  // result.toolResults[0].output — what execute() returned
}
```

### handleMaidHireAgentic() Return Signature (should match deterministic)

```typescript
// Matches handleMaidHireStateMachine return type for drop-in substitution
async function handleMaidHireAgentic(
  conversationId: string,
  latestMessage: string,
  coreMessages: any[],
  dbSession: any,
): Promise<{
  displayText: string;
  shouldEscalate: boolean;
  collectedData: Record<string, any>;
  tookMs: number;
  systemPrompt: string;
  rawResponse: string;
  extractionMeta: ExtractionMeta;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  newState: string;
}>
```

**Critical:** The return type MUST match `handleMaidHireStateMachine` exactly. The route.ts logging and escalation logic runs AFTER the handler returns and is shared — both paths feed the same `logLLMInteraction()` and leads insert code. The `extractionMeta` field should be set to a default value for agentic turns (no regex extraction runs in the agentic path — extraction happens via tools).

### Supabase Migration for Phase 2

```sql
-- supabase-migration-phase2.sql
-- Adds agentic_mode tracking to conversation_sessions
-- Safe to re-run (IF NOT EXISTS)

ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS agentic_mode BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_agentic_mode
  ON conversation_sessions(agentic_mode, created_at DESC);
```

### Force Escalate Logic (FLOW-05)

```typescript
// Source: mirrors existing shouldForceEscalate pattern from BaseFlow.ts
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// In agenticMaidHire.ts
function shouldForceEscalateAgentic(consecutiveFailures: number): boolean {
  return consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;
}

// Usage:
if (shouldForceEscalateAgentic(consecutiveFailures)) {
  const hasPhone = !!collectedData.phone;
  const forceText = hasPhone
    ? `Our team will call you at ${collectedData.phone} within 2 hours.`
    : "Our team is standing by. Call us directly or try again shortly.";

  // Save partial lead if phone available
  return {
    displayText: forceText,
    shouldEscalate: hasPhone,
    collectedData,
    // ... other fields
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `parameters` in `tool()` | `inputSchema` in `tool()` | ai@5 → ai@6 | Both still work in v6.0.41; use `inputSchema` for forward compat |
| `maxSteps` in `generateText()` | `stopWhen: stepCountIs(N)` | ai@5 → ai@6 | `maxSteps` removed; use `stopWhen` or rely on default single-step |
| `generateObject()` for structured output | `generateText()` with `output` setting | ai@6 | `generateObject` deprecated in v6 but still works; `llmExtractor.ts` uses it and will continue to work |
| `result.toolCalls[0].args` | `result.toolCalls[0].input` | ai@5 → ai@6 | Property renamed; `args` is undefined in v6 |

**Deprecated/outdated:**
- `generateObject()`: Deprecated in ai@6 per migration guide; use `generateText` with `output` setting for new code. The existing `llmExtractor.ts` uses it and still works — do NOT change it for Phase 2.
- `maxSteps`: Not present in ai@6 `generateText()` signature. Use `stopWhen: stepCountIs(N)` instead.

---

## Integration Architecture

### How agenticMaidHire.ts Integrates with route.ts

```
POST /api/chat
  → getOrCreateSession()          [unchanged]
  → if intent === 'maid_hire':
      → if USE_AGENTIC === 'true':
          → handleMaidHireAgentic()     [NEW]
              → buildAgenticSystemPrompt()
              → generateText() with tools
              → execute tool (validate + update collectedData)
              → check consecutive failures (FLOW-05)
              → check tool loop (FLOW-06)
              → check completion (all required fields)
              → saveAgenticSession() → Supabase (agentic_mode=true)
              → return {displayText, shouldEscalate, ...}
          → logLLMInteraction()     [unchanged, shared]
          → if shouldEscalate: insert leads + sendEmail   [unchanged, shared]
          → createUIMessageStreamResponse()   [unchanged, shared]
      → else:
          → handleMaidHireStateMachine()   [unchanged]
```

### Session State Lifecycle in Agentic Mode

```
Turn 1: START → LLM asks for phone → no tool called
Turn 2: User gives phone → save_phone tool called → phone saved → NEED_LOCATION
Turn 3: User gives location + service → save_location called → NEED_SERVICE
Turn 4: save_service_type called → NEED_SCHEDULE
Turn 5: User gives schedule → save_schedule called → COMPLETE (all required fields)
  → shouldEscalate = true → leads insert + email
```

---

## Open Questions

1. **How to handle `result.text` being empty when a tool is called**
   - What we know: When Gemma calls a tool, `result.text` is often empty string
   - What's unclear: Should we derive display text from the tool's output, or generate a separate LLM call for the response text?
   - Recommendation: Derive from tool output — if `output.success === true`, say "Got it! [next question]"; if `output.success === false`, use `output.error` as display text. This avoids an extra LLM call per turn.

2. **Whether Gemma reliably calls tools vs responding with text**
   - What we know: Gemma 3 27B is an instruction-following model, not a purpose-built agentic model (like GPT-4o)
   - What's unclear: How reliably Gemma calls the right tool vs just responding with text without calling a tool
   - Recommendation: System prompt should be explicit: "If the user has provided a value for [field], you MUST call the appropriate save_* tool. Do not acknowledge data without calling the tool." Add a post-generation check: if user message contains a phone number pattern but no `save_phone` call was made, fall back to regex extraction + manual save.

3. **Whether `toolChoice: 'auto'` causes Gemma to call tools reliably enough**
   - What we know: Some GitHub issues report `toolChoice: 'required'` not working reliably
   - What's unclear: Whether `toolChoice: 'auto'` is sufficient for consistent tool calling
   - Recommendation: Use `auto` as designed, but add a fallback: if no tool was called after a turn where a slot was clearly provided (detected by regex), manually execute the appropriate save tool logic without LLM.

4. **The `collected_via` field in the `leads` table**
   - What we know: Deterministic path writes `collected_via: 'state_machine'`
   - What's unclear: What value the agentic path should write
   - Recommendation: Write `collected_via: 'agentic'` for leads captured by the agentic handler.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — skipping this section.

---

## Sources

### Primary (HIGH confidence)
- `C:/Coding/EzyBot/ezybot/node_modules/ai/dist/index.d.ts` — TypeScript type definitions for tool(), generateText(), TypedToolCall.input property; verified installed version 6.0.41
- Runtime test of `tool({ inputSchema: ... })` and `tool({ parameters: ... })` against installed ai@6.0.41 — both accepted
- `C:/Coding/EzyBot/ezybot/src/flows/BaseFlow.ts` — CollectedData, SessionState, shouldForceEscalate() patterns reused
- `C:/Coding/EzyBot/ezybot/src/flows/MaidHiringFlow.ts` — validator functions, step definitions, getCompletionInstruction()
- `C:/Coding/EzyBot/ezybot/src/app/api/chat/route.ts` — handleMaidHireStateMachine return type, route.ts routing pattern, DEMO_MODE env flag pattern, saveStateMachineSession() pattern
- `C:/Coding/EzyBot/ezybot/src/extractors/dataExtractor.ts` — isValidPhone() and validator function implementations

### Secondary (MEDIUM confidence)
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling — official Vercel AI SDK tool calling docs
- https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text — generateText parameter reference
- https://ai-sdk.dev/docs/agents/loop-control — stopWhen/stepCountIs documentation
- https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0 — confirmed `parameters` → `inputSchema` rename, `generateObject` deprecation, `args` → `input` rename

### Tertiary (LOW confidence)
- GitHub issues re: `toolChoice: 'required'` reliability — multiple 2025 reports of unreliable enforcement; not officially documented limitation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed and version-verified
- Architecture: HIGH — verified against actual installed types and existing codebase patterns
- Tool API: HIGH — runtime-tested `tool()` function; TypeScript types inspected directly
- Gemma tool-calling reliability: LOW — no direct testing of Gemma 3 27B with tools in this codebase; mitigations documented
- Pitfalls: HIGH (code pitfalls) / MEDIUM (Gemma behavior pitfalls)

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (30 days — ai SDK is fast-moving but v6 is stable release)
