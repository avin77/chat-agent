# EzyBot: Comprehensive System Analysis & Improvement Plan

## 1. CURRENT ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ChatWidget.tsx (useChat hook)                               │
│  └─ SuggestionChips → pre-fills input (doesn't auto-submit) │
│  └─ Session ID: localStorage (Math.random, NOT crypto)       │
│  └─ [ESCALATE] tag stripping (client-side display only)      │
└────────────────────┬─────────────────────────────────────────┘
                     │ POST /api/chat
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                     API ROUTE (route.ts)                      │
│                                                              │
│  1. Parse JSON body                                          │
│  2. Rate limit check (in-memory, 20 req/min)                 │
│  3. Session lookup/create (Supabase conversation_sessions)   │
│  4. Intent detection (regex, per-message re-evaluation)      │
│  5. System prompt selection (4 static prompts)               │
│  6. Phone validation injection into prompt                   │
│  7. Message trimming (keep 12, trim to first 2 + last 10)   │
│  8. generateText() → Gemini gemma-3-27b-it                  │
│  9. Safety net (fallback if response <4 chars or empty)      │
│ 10. Guardrails (price blocking, link removal, location)      │
│ 11. Log to Supabase (llm_logs)                              │
│ 12. Escalation check ([ESCALATE] tag OR phone+action intent) │
│     └─ DB insert (complaints/leads/helper_regs/general)      │
│     └─ Email to ADMIN_EMAIL                                  │
│ 13. Strip [ESCALATE], return as UI Message Stream            │
└──────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│               SUPABASE (PostgreSQL)                           │
│  Tables:                                                     │
│  - conversation_sessions (intent per conversation)           │
│  - llm_logs (every LLM interaction)                          │
│  - complaints (escalated complaints)                         │
│  - leads (maid hire leads)                                   │
│  - helper_registrations (helper signups)                     │
│  - general_enquiries (FAQ logs)                              │
└──────────────────────────────────────────────────────────────┘
```

### Classification: NON-AGENTIC System

This is a **non-agentic, prompt-driven chatbot**. Here's why:

| Feature | Agentic System | Current EzyBot |
|---------|---------------|----------------|
| Tool use (search, APIs) | Yes | No |
| Multi-step reasoning | Yes | No — single LLM call per message |
| Self-correction | Yes | No — safety net is hardcoded fallback |
| Memory/state machine | Yes | Partial — intent stored, no field tracking |
| Autonomous planning | Yes | No — all behavior is in static prompts |
| Goal decomposition | Yes | No — one prompt per intent |

**Current system = LLM-as-a-formatter**: The regex detects intent, the prompt tells the LLM what to say, guardrails clean the output. The LLM adds natural language polish but doesn't reason.

---

## 2. WHAT'S MISSING: MULTI-QUESTION FLOW

### The Problem

For maid hiring, the business needs 8 data points from the customer:

| # | Field | Question | Currently Collected? |
|---|-------|----------|---------------------|
| 1 | full_name | "May I have your full name?" | Partially (extractName regex) |
| 2 | phone | "Your 10-digit mobile number?" | Yes (validatePhone) |
| 3 | address | "Where are you located?" | No |
| 4 | family_members | "How many family members?" | No |
| 5 | house_size | "House size (2BHK, 3BHK)?" | No |
| 6 | work_type | "What work (Cooking, Cleaning)?" | No |
| 7 | duration_months | "How many months of hire?" | No |
| 8 | language_pref | "Language preference?" | No |

**Current behavior**: Bot asks for phone, gets it, escalates. Only 2/8 fields collected. The team gets a lead with just name+phone and no requirements — making follow-up calls inefficient.

### The Solution Already Exists (Dead Code)

The codebase has a complete state machine architecture in `src/flows/` and `src/extractors/` that was never integrated:

- `BaseFlow.ts` — step-by-step state machine with validators and retry logic
- `MaidHiringFlow.ts` — 4-step flow (phone → location → work_type → requirements)
- `HelperRegistrationFlow.ts` — 4-step flow (name → phone → work_type → location)
- `ComplaintFlow.ts` — 1-step flow (phone only, fast escalation)
- `dataExtractor.ts` — extracts name, phone, location, workType, requirements
- `intentDetector.ts` — weighted scoring with confidence levels
- `testRunner.ts` — 28 test cases with metrics

---

## 3. METRICS: WHAT SHOULD BE TRACKED

### A. Technical Metrics (System Health)

| Metric | Description | Current State | Target |
|--------|-------------|---------------|--------|
| **LLM Latency (p50/p95/p99)** | Time from API call to response | Logged as `took_ms` in llm_logs | <3s p95 |
| **Safety Net Trigger Rate** | % of responses that hit fallback | Not tracked | <5% |
| **Guardrail Trigger Rate** | % of responses modified by guardrails | Not tracked | <10% |
| **Empty Response Rate** | % of LLM responses that are empty/"." | Not tracked | 0% |
| **API Error Rate (4xx/5xx)** | Failed requests | Not tracked | <1% |
| **Rate Limit Hit Rate** | % of requests hitting Gemini quota | Not tracked | <2% |
| **Session Creation Failures** | Supabase connection errors | Logged to file | 0% |
| **Escalation Email Failures** | Email send failures | Logged to console | 0% |

### B. Functional Metrics (Business Logic)

| Metric | Description | Current State | Target |
|--------|-------------|---------------|--------|
| **Intent Detection Accuracy** | Correct intent vs actual | Not measured | >95% |
| **Intent Switch Rate** | How often intent changes mid-conversation | Not tracked | Monitor |
| **Data Extraction Accuracy** | Name/phone correctly extracted | Not measured | >98% |
| **Flow Completion Rate** | % of users who complete all steps | Not tracked (no multi-step flow) | >60% |
| **Fields Collected per Lead** | Average data points per maid_hire lead | Currently ~2 (name+phone) | 6+ |
| **Drop-off Step** | Which step users abandon | Not tracked | Identify and fix |
| **Escalation Rate** | % of conversations that escalate | Not tracked | Should match intent |
| **False Escalation Rate** | Escalations without sufficient data | Not tracked | <5% |

### C. Non-Functional Metrics (Quality & UX)

| Metric | Description | Current State | Target |
|--------|-------------|---------------|--------|
| **Response Relevance** | Does bot response match user intent? | Not measured | HITL sampling |
| **Conversation Length** | Messages per conversation | Can compute from llm_logs | 3-8 for hire, 2-3 for complaint |
| **User Satisfaction (CSAT)** | Post-chat rating | Not implemented | Add after flow |
| **First Response Time** | Time to first bot response | Includes compile time in dev | <2s |
| **Repeat Contact Rate** | Same user coming back unresolved | Not tracked | <15% |
| **Price Leak Rate** | Price info slipping through guardrails | Not tracked | 0% |
| **Hallucination Rate** | Bot making up services/promises | Not measured | HITL review |

---

## 4. MULTI-INTENT HANDLING

### Current Behavior (Broken)

```
User: "I need a maid" → intent: maid_hire ✅
User: "Also I have a complaint about the last one" → intent switches to: complaint ✅
User: "My number is 9876543210" → detectIntent returns: general ❌
    (but session retains 'complaint' from DB — partially works)
```

**Problems:**
1. User can only be in ONE intent at a time — no parallel tracking
2. Data-only messages ("9876543210") re-trigger intent detection returning "general"
3. No way to resume a previous intent after switching

### Proposed: Intent Stack with Context

```
Session State:
{
  conversation_id: "abc123",
  primary_intent: "maid_hire",
  secondary_intent: "complaint",     // stacked
  active_intent: "complaint",        // currently being processed
  intent_history: ["maid_hire", "complaint"],
  maid_hire_state: { step: 2, data: { phone: "9876543210" } },
  complaint_state: { step: 0, data: {} }
}
```

When user sends a phone number, the system should:
1. Skip intent detection (it's a data message, not an intent signal)
2. Apply the number to the **active** intent's current step
3. If the active flow completes, pop back to the previous intent

---

## 5. HOW TO KNOW THE SYSTEM IS WORKING CORRECTLY

### Layer 1: Automated Test Suite (Pre-deploy)

The dead code in `src/test/testRunner.ts` already defines 28 test cases. These need to be:
1. Connected to the actual API route (not just the dead flow code)
2. Run as part of CI/CD before every deploy
3. Cover: intent detection, data extraction, flow completion, edge cases

**Test categories needed:**

| Category | Tests | What It Validates |
|----------|-------|-------------------|
| Intent Detection | 15+ | Each intent correctly identified from varied messages |
| Data Extraction | 10+ | Phone, name, location, work type correctly parsed |
| Multi-Turn Flow | 8+ | Full conversation flow from start to escalation |
| Edge Cases | 10+ | Invalid phones, name-like words, intent switching |
| Guardrails | 5+ | Price blocking, link removal, location handling |
| Safety Net | 5+ | Empty/truncated response handling |
| Regression | Per-bug | One test per historical bug |

### Layer 2: HITL (Human-in-the-Loop) Review

```
┌─────────────────────────────────────────────────────┐
│                HITL Review Dashboard                 │
│                                                     │
│  Random Sample: 10% of conversations daily          │
│                                                     │
│  Reviewer checks:                                   │
│  ☐ Intent correctly detected?                       │
│  ☐ Bot asked the right questions?                   │
│  ☐ Data correctly extracted?                        │
│  ☐ Escalation triggered correctly?                  │
│  ☐ Response tone appropriate?                       │
│  ☐ No hallucinations?                               │
│  ☐ No price leaks?                                  │
│                                                     │
│  Tags: [correct] [wrong_intent] [missed_data]       │
│         [bad_tone] [hallucination] [price_leak]     │
│                                                     │
│  Feedback → stored in `hitl_reviews` table          │
│  Weekly accuracy report auto-generated              │
└─────────────────────────────────────────────────────┘
```

### Layer 3: Business Outcome Tracking

| Signal | Meaning | Action |
|--------|---------|--------|
| Lead generated but team can't reach customer | Phone extraction wrong | Fix extraction |
| Customer calls back saying "bot didn't help" | Flow didn't complete or bad response | Review conversation |
| Team says "lead has no requirements" | Multi-question flow not collecting data | Add more steps |
| Helper registered but wrong skill recorded | Work type extraction wrong | Fix extraction |
| Complaint not escalated | [ESCALATE] tag not emitted | Add deterministic check |

---

## 6. HITL CONTINUOUS IMPROVEMENT LOOP

```
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
  │ Conversations│────▶│ HITL Review  │────▶│ Improvement DB  │
  │ (llm_logs)  │     │ (10% sample) │     │ (tagged issues) │
  └─────────────┘     └──────────────┘     └────────┬────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │  Weekly Analysis     │
                                          │  - Top failure modes │
                                          │  - Prompt tweaks     │
                                          │  - New test cases    │
                                          │  - Flow adjustments  │
                                          └──────────┬──────────┘
                                                     │
                            ┌────────────────────────┼────────────────┐
                            ▼                        ▼                ▼
                    ┌───────────────┐     ┌──────────────┐   ┌──────────────┐
                    │ Update Prompts│     │ Add Test Case│   │ Update Flow  │
                    │ (few-shot     │     │ (regression  │   │ (new step/   │
                    │  examples)    │     │  prevention) │   │  validator)  │
                    └───────────────┘     └──────────────┘   └──────────────┘
```

### Data Sources for Improvement

1. **llm_logs table**: Every interaction with raw vs cleaned response — find where guardrails modified output
2. **HITL reviews**: Human-tagged accuracy scores per conversation
3. **Business feedback**: "Customer said X but bot did Y" from the ops team
4. **Test results**: Automated regression catching new failures
5. **Drop-off analysis**: Which step in the flow users abandon

### How to Use This Data

| Data Signal | Action |
|-------------|--------|
| Same wrong response pattern 5+ times | Add as negative few-shot example in prompt |
| Intent misclassified for specific phrase | Add regex pattern to detectIntent() |
| Phone extraction fails on specific format | Add pattern to validatePhone() |
| Users consistently drop at step 3 | Simplify the question or make it optional |
| Model hallucinates a service | Add to guardrails blocklist |
| Good conversation pattern | Add as positive few-shot example |

---

## 7. SCALING PLAN: NON-AGENTIC → SEMI-AGENTIC → FULLY AGENTIC

### Phase 1: Fix Current System (Week 1-2) — NON-AGENTIC ✅ (partially done)

**What we just fixed:**
- [x] Safety net now works (generateText instead of streamText)
- [x] Improved prompts with few-shot examples
- [x] Deterministic escalation (phone + action intent = auto-escalate)
- [x] Guardrails regex bug fixed
- [x] Email XSS fix
- [x] Better intent detection patterns

**Still needed:**
- [ ] Integrate dead code state machine (flows + extractors)
- [ ] Multi-question flow for maid hiring (8 fields)
- [ ] Store collected fields in session state (not just intent)
- [ ] Add test framework (vitest) + wire up testRunner.ts
- [ ] Centralize Supabase client
- [ ] Protect debug dashboard with auth

### Phase 2: Semi-Agentic with State Machine (Week 3-4)

```
┌────────────────────────────────────────────────────────────┐
│                  SEMI-AGENTIC ARCHITECTURE                  │
│                                                            │
│  User Message                                              │
│       │                                                    │
│       ▼                                                    │
│  ┌─────────────┐    ┌──────────────┐   ┌───────────────┐ │
│  │   Intent     │───▶│  Flow Engine  │──▶│  LLM (Gemini) │ │
│  │   Detector   │    │  (BaseFlow)   │   │  (formatter)  │ │
│  │  (weighted)  │    │              │   │               │ │
│  └─────────────┘    │  State:       │   │  Input:       │ │
│                      │  - step       │   │  - system     │ │
│                      │  - collected  │   │    prompt     │ │
│                      │  - attempts   │   │  - next Q     │ │
│                      │  - progress   │   │  - context    │ │
│                      └──────────────┘   └───────────────┘ │
│                             │                              │
│                             ▼                              │
│                      ┌──────────────┐                      │
│                      │  Deterministic│                      │
│                      │  Escalation   │                      │
│                      │  + DB Insert  │                      │
│                      │  + Email      │                      │
│                      └──────────────┘                      │
└────────────────────────────────────────────────────────────┘
```

**Key changes:**
- Intent detection uses weighted scoring (intentDetector.ts) instead of regex
- Conversation state tracked per-field in Supabase (not just intent)
- LLM is used for natural language generation only — decisions are deterministic
- Flow engine controls which question to ask next
- Data extraction validates before advancing step
- Progress bar shown to user ("Step 3/5")

### Phase 3: Fully Agentic (Month 2-3)

```
┌────────────────────────────────────────────────────────────┐
│                   AGENTIC ARCHITECTURE                      │
│                                                            │
│  ┌──────────────────────────────────────────┐              │
│  │            Agent Orchestrator             │              │
│  │                                          │              │
│  │  Tools available:                        │              │
│  │  - search_helpers(location, skill)       │              │
│  │  - check_availability(helper_id, date)   │              │
│  │  - create_lead(name, phone, reqs)        │              │
│  │  - send_profiles(phone, helper_ids)      │              │
│  │  - schedule_callback(phone, time)        │              │
│  │  - lookup_complaint(phone)               │              │
│  │  - check_service_area(pincode)           │              │
│  │                                          │              │
│  │  Memory:                                 │              │
│  │  - Conversation history                  │              │
│  │  - Collected user data                   │              │
│  │  - Previous interactions (if returning)  │              │
│  │                                          │              │
│  │  Reasoning:                              │              │
│  │  - Multi-step planning                   │              │
│  │  - Self-correction on extraction errors  │              │
│  │  - Dynamic question ordering             │              │
│  └──────────────────────────────────────────┘              │
│                                                            │
│  Example agentic flow:                                     │
│  1. User: "I need a cook in Koramangala"                   │
│  2. Agent thinks: "I have location + service type.          │
│     I need phone. Let me also search for available          │
│     helpers in Koramangala who cook."                       │
│  3. Agent calls: search_helpers("Koramangala", "Cooking")  │
│  4. Agent: "We have 5 verified cooks in Koramangala!       │
│     Share your phone number and I'll send their profiles."  │
│  5. User: "9876543210"                                     │
│  6. Agent calls: create_lead(...) + send_profiles(...)     │
│  7. Agent: "Done! 3 profiles sent to your number.          │
│     Our team will call to finalize."                       │
└────────────────────────────────────────────────────────────┘
```

---

## 8. MAID HIRING QUESTION FLOW (DETAILED)

### Proposed Flow with Priority Ordering

```
Step 1: Phone Number (REQUIRED — gate for escalation)
  Q: "Sure! Please share your 10-digit mobile number so we can send you profiles."
  Validator: 10-digit Indian number starting 6-9
  Retry: "That doesn't look right. Please provide a valid 10-digit number."

Step 2: Name (REQUIRED)
  Q: "Thank you! What's your full name?"
  Validator: 2+ alphabetic chars, not a common word
  Retry: "Could you please share your name?"

Step 3: Location (REQUIRED)
  Q: "Which area in Bengaluru are you located? (e.g., Koramangala, HSR Layout)"
  Validator: Matches known Bangalore areas OR free text
  Retry: "Please share your area/locality in Bengaluru."

Step 4: Work Type (REQUIRED)
  Q: "What type of help do you need? (Cooking / Cleaning / Baby Care / Elderly Care)"
  Validator: Matches known work types
  Retry: "Please select: Cooking, Cleaning, Baby Care, or Elderly Care."

Step 5: Schedule (OPTIONAL)
  Q: "Do you need full-time or part-time help?"
  Validator: Matches full-time/part-time/live-in
  Retry: Skip after 1 failed attempt

Step 6: House Size (OPTIONAL)
  Q: "What's your house size? (1BHK / 2BHK / 3BHK / Villa)"
  Validator: Matches known sizes
  Retry: Skip after 1 failed attempt

[ESCALATE after Step 4 — Steps 5-6 are bonus data]

Completion Message:
"Thank you, {name}! ✅

Your Requirements:
• Location: {location}
• Service: {work_type}
• Type: {schedule}

We'll send verified profiles to {phone} within 2 hours.
Our team will call you to discuss further."
```

### Smart Data Detection

If user provides multiple data points in one message:
- "I'm Rahul, need a cook in HSR, 9876543210"
- System should extract ALL fields and skip to the next uncollected one
- Not ask questions for data already provided

---

## 9. DASHBOARD METRICS NEEDED

### Operations Dashboard

```
┌────────────────────────────────────────────────────────────┐
│  EZYBOT OPERATIONS DASHBOARD                               │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │ Today's Chats│  │ Leads Today │  │ Complaints   │      │
│  │     127      │  │     34      │  │      8       │      │
│  └─────────────┘  └─────────────┘  └──────────────┘      │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │ Helper Regs │  │ Avg Latency │  │ Error Rate   │      │
│  │      12     │  │    2.3s     │  │    0.8%      │      │
│  └─────────────┘  └─────────────┘  └──────────────┘      │
│                                                            │
│  INTENT BREAKDOWN (pie chart)                              │
│  ■ Maid Hire: 52%  ■ General: 28%                        │
│  ■ Complaint: 12%  ■ Helper Reg: 8%                      │
│                                                            │
│  FLOW COMPLETION FUNNEL                                    │
│  Step 1 (Phone):    100% ████████████████████ 34          │
│  Step 2 (Name):      88% ████████████████░░░ 30          │
│  Step 3 (Location):  71% ██████████████░░░░░ 24          │
│  Step 4 (Work Type): 65% ████████████░░░░░░░ 22          │
│  Escalated:          65% ████████████░░░░░░░ 22          │
│                                                            │
│  DROP-OFF ANALYSIS                                         │
│  Users who abandoned at Step 3: 6                          │
│  Common reason: "I'll call you instead" (3 users)          │
│                                                            │
│  QUALITY METRICS                                           │
│  Intent Accuracy: 96.2%                                    │
│  Data Extraction: 98.1%                                    │
│  Safety Net Triggers: 2.1% (↓ from 18% last week)        │
│  Price Leak Rate: 0%                                       │
│  HITL Score (this week): 94/100                            │
│                                                            │
│  RECENT CONVERSATIONS (table)                              │
│  ID     | Intent    | Steps | Status    | Latency         │
│  abc123 | maid_hire | 4/4   | Escalated | 2.1s            │
│  def456 | complaint | 1/1   | Escalated | 1.8s            │
│  ghi789 | general   | -     | Answered  | 1.5s            │
│  jkl012 | maid_hire | 2/4   | Abandoned | 3.2s            │
└────────────────────────────────────────────────────────────┘
```

### Supabase Views/Queries Needed

```sql
-- Daily conversation count by intent
SELECT DATE(created_at), intent, COUNT(*)
FROM conversation_sessions GROUP BY 1, 2;

-- Flow completion rate
SELECT intent,
  COUNT(*) FILTER (WHERE escalated = true) as completed,
  COUNT(*) as total
FROM conversation_sessions GROUP BY intent;

-- Average fields collected per lead
SELECT AVG(
  (CASE WHEN name IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN location IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN work_type IS NOT NULL THEN 1 ELSE 0 END)
) as avg_fields FROM leads;

-- Safety net trigger rate
SELECT
  COUNT(*) FILTER (WHERE raw_llm_response = '.' OR LENGTH(raw_llm_response) < 4) as safety_net,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE raw_llm_response = '.' OR LENGTH(raw_llm_response) < 4) / COUNT(*), 1) as rate
FROM llm_logs WHERE created_at > NOW() - INTERVAL '24 hours';

-- Latency percentiles
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY took_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY took_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY took_ms) as p99
FROM llm_logs WHERE created_at > NOW() - INTERVAL '24 hours';

-- Guardrail trigger rate
SELECT
  COUNT(*) FILTER (WHERE raw_llm_response != after_guardrails) as guardrailed,
  COUNT(*) as total
FROM llm_logs WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## 10. IMPLEMENTATION ROADMAP

### Week 1-2: Foundation (Current)
- [x] Fix safety net (generateText)
- [x] Improve prompts with examples
- [x] Deterministic escalation
- [x] Guardrails bug fix
- [ ] Integrate state machine (BaseFlow + MaidHiringFlow)
- [ ] Store session state with collected fields in Supabase
- [ ] Add vitest + adapt testRunner.ts
- [ ] Centralize Supabase client

### Week 3-4: Multi-Question Flow
- [ ] Implement 6-step maid hiring flow
- [ ] Smart data detection (extract all fields from one message)
- [ ] Progress indicator in UI
- [ ] Drop-off tracking
- [ ] Suggestion chips auto-submit
- [ ] HITL review table + basic review UI

### Week 5-6: Dashboard & Monitoring
- [ ] Operations dashboard (above design)
- [ ] Flow completion funnel visualization
- [ ] Alert system (error rate spike, safety net rate spike)
- [ ] Weekly automated quality report
- [ ] HITL review workflow

### Week 7-8: Semi-Agentic Upgrade
- [ ] Replace regex intent detection with weighted scoring
- [ ] Dynamic question ordering based on collected data
- [ ] Context carry-over across intent switches
- [ ] Model upgrade to gemini-2.0-flash (when quota available)
- [ ] A/B testing framework for prompts

### Month 3+: Fully Agentic
- [ ] Tool-use architecture (search helpers, check availability)
- [ ] Returning user recognition
- [ ] Real-time helper matching
- [ ] Callback scheduling
- [ ] Multi-language support (Hindi, Kannada)

---

## 11. QUESTIONS FOR CUSTOMER DURING MAID HIRING

### Required Questions (must collect)

1. **Phone Number**: "Please share your 10-digit mobile number so we can send you profiles."
2. **Name**: "What's your full name?"
3. **Location**: "Which area in Bengaluru? (Koramangala, HSR, Whitefield, etc.)"
4. **Service Type**: "What help do you need? (Cooking / Cleaning / Baby Care / Elderly Care / Multiple)"

### Optional Questions (collect if user is engaged)

5. **Schedule**: "Full-time or part-time?"
6. **House Size**: "What's your house size? (1BHK / 2BHK / 3BHK / Villa)"
7. **Family Members**: "How many family members?" (helps match right helper)
8. **Language**: "Any language preference? (Hindi, Kannada, Tamil, English)"
9. **Start Date**: "When do you need help from?"
10. **Budget Range**: "Do you have a budget range in mind?" (DON'T quote prices, just record)

### Adaptive Questioning

- If user gives "I need a cook in Koramangala" → skip location question
- If user gives all info upfront → skip to confirmation
- If user seems impatient (short responses) → ask only required questions
- After 3 unanswered optional questions → escalate with what we have
