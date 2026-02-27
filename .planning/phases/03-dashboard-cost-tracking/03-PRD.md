# Phase 3 PRD: Observability, Cost & Shadow Alignment

**Source:** User-provided PRD (2026-02-27)
**Status:** Ready to use as CONTEXT.md input

---

## Goal
Establish full production visibility and validate agent alignment before enabling any autonomous tool-calling.

## Requirements to Cover
COST-01, COST-02, COST-03, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05 + new: SHADOW-01–04, CONV-01–04, ALERT-01–04

---

## Token Logging (add to llm_logs)
- prompt_tokens
- completion_tokens
- total_tokens
- estimated_cost_usd

---

## Dashboard Metrics (Product Health tab)
- Lead completion rate
- Slot fill rate (per field)
- Lead quality score
- Escalation rate
- Average session duration
- Average tokens per conversation
- Fallback rate
- LLM error rate
- Shadow alignment % (once shadow mode active)

---

## Shadow Mode Alignment Testing

**Purpose:** Before trusting the agentic handler with real users, run it silently alongside production to measure how often it would have made the same decision as the deterministic system. Only flip `USE_AGENTIC=true` once it proves ≥95% agreement for 7 straight days.

---

### Mental Model

Think of it like a student shadowing a doctor.

The doctor (deterministic state machine) makes all real decisions. The student (agentic handler) watches each case, writes down what they *would* have done, and hands it to the supervisor. Nobody acts on the student's notes yet. After enough cases, you check: does the student's judgment match the doctor's? If yes — the student is ready to treat patients.

---

### Exact Execution Flow Per Turn

```
User sends message
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  PRODUCTION PATH (always runs, controls the user)   │
│                                                     │
│  1. extractAllSlotsWithLLM()  ← Phase 1             │
│  2. handleMaidHireStateMachine()                    │
│  3. guardrails.ts                                   │
│  4. Return response to user                         │
└─────────────────────────────────────────────────────┘
        │
        │  after production response is sent
        │  (does NOT block the user response)
        ▼
┌─────────────────────────────────────────────────────┐
│  SHADOW PATH (runs async, user never sees this)     │
│                                                     │
│  1. Same user message + same session state          │
│  2. shadowAgenticHandler() — calls Gemini           │
│     → proposes: next_state, tool_calls, slots       │
│  3. Compare shadow proposal vs what production did  │
│  4. Log to shadow_logs table:                       │
│     { agreed: true/false, prod_decision,            │
│       shadow_proposal, conversation_id, turn_ms }   │
└─────────────────────────────────────────────────────┘
```

**Key constraint:** Shadow path runs AFTER the response is already sent to the user. Zero latency impact on production.

---

### What Gets Compared

Each turn produces one comparison row:

| What production decided | What shadow proposed | Agreement? |
|------------------------|---------------------|-----------|
| Move to ASK_SERVICE | Move to ASK_SERVICE | ✓ |
| Extract location = "Koramangala" | Extract location = "Koramangala" | ✓ |
| Stay at ASK_PHONE (invalid input) | Call collect_phone tool | ✓ |
| Escalate (3 attempts reached) | Call escalate_lead tool | ✓ |
| Stay at ASK_LOCATION | Move to ASK_SERVICE (wrong) | ✗ logged |

---

### New Supabase Table: `shadow_logs`

```sql
CREATE TABLE shadow_logs (
  id              uuid DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  turn_number     int,
  current_state   text,           -- state machine was in
  user_message    text,
  prod_next_state text,           -- what deterministic did
  prod_slots      jsonb,          -- slots production extracted
  shadow_proposal jsonb,          -- { next_state, tool_calls, slots }
  agreed          boolean,        -- prod_next_state == shadow_proposal.next_state
  shadow_latency_ms int,
  created_at      timestamptz DEFAULT now()
);
```

---

### Dashboard: Shadow Alignment Panel

New section in Product Health tab:

| Metric | What it shows |
|--------|---------------|
| **Overall agreement %** | Agreed turns / total turns (last 7 days) |
| **State transition agreement %** | How often shadow picks same next state |
| **Slot extraction agreement %** | How often shadow extracts same field values |
| **Escalation agreement %** | How often shadow agrees on escalate/don't escalate |
| **7-day trend** | Is alignment improving, stable, or degrading? |
| **Agentic readiness** | Green ✓ / Red ✗ — is ≥95% met for 7 consecutive days? |

---

### Gate Before Enabling USE_AGENTIC=true

Only flip the feature flag when ALL conditions are true:

1. Overall agreement ≥ 95% (measured over last 7 days)
2. No single day below 90% in those 7 days
3. No cost anomaly (shadow avg tokens < 2× production avg)
4. No repeated invalid tool proposals (same wrong tool called > 3× in one day)
5. Manual review of disagreement log (spot-check 10 disagreed turns)

This is visible as a checklist in the dashboard Shadow Alignment panel.

---

**Alignment metrics to track:**
- State transition agreement %
- Slot extraction agreement %
- Tool-call proposal correctness
- Escalation decision agreement

**Alignment requirement before agentic rollout:**
- ≥95% agreement with deterministic flow
- Stable for 7 consecutive days
- No cost anomaly
- No repeated invalid tool proposals

---

## Conversation Robustness Layer

**Problem:** When user says something off-topic (pricing question, emoji, wrong intent), state machine repeats same question indefinitely — "looping bot" effect.

**Fix: Message Classification Layer**

Before state machine processes input, run lightweight LLM classification:

Categories:
- `expected_slot_answer` → continue normal flow
- `new_intent` → reset flow or ask confirmation
- `meta_question` → respond helpfully, keep state
- `clarification_request` → clarify, keep state
- `off_topic` → gentle redirect
- `abusive` → escalate / block
- `unknown` → treat as off_topic

**Confusion counter:**
- After 2 consecutive irrelevant answers in same state → offer: "It seems we are stuck. Would you like to restart or talk to support?"
- Max repeat threshold prevents infinite loops

**Example:**
- State: ASK_LOCATION
- User: "How much does this cost?"
- Old: "Please share your location."
- New: "Our pricing depends on your area. Could you share your location first?"

**Files:**
- `src/extractors/intentClassifier.ts` — NEW: lightweight classification function
- `src/app/api/chat/route.ts` — integrate classifier before state machine
- `src/flows/MaidHiringFlow.ts` — add confusion counter to state

---

## Alert Thresholds

- Fallback rate > 5%
- LLM error rate > 1%
- Eval regression < 95%
- Daily token spend exceeds budget
- Shadow alignment drops below 95%

Alerts: log to console + Supabase `system_alerts` table (new) OR surface as dashboard banner

---

## Success Criteria

1. `/dashboard` → Product Health tab shows live data (not empty)
2. `llm_logs` includes non-null token columns after any conversation
3. Cost per conversation visible in dashboard
4. Shadow alignment metrics visible in dashboard
5. Conversation robustness: bot no longer loops on off-topic input
6. No production regressions after Phase 1 rollout

---

## Deferred to Future Milestone (per user decision)
- Hybrid agentic tool-calling execution (Phase 2 — deferred)
- Controlled traffic rollout
- Data flywheel scripts (Phase 4 — deferred)
- Multi-intent orchestration

---

*PRD saved: 2026-02-27*
*Use this as input for: /gsd:plan-phase 3 --prd .planning/phases/03-dashboard-cost-tracking/03-PRD.md*
