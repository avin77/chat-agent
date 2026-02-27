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

**Purpose:** Validate how a future agentic handler would behave WITHOUT affecting production.

**How it works:**
- Deterministic state machine controls production flow (unchanged)
- In parallel, experimental agentic handler runs in shadow mode
- Shadow agent PROPOSES (but does NOT execute):
  - Next state
  - Tool calls
  - Slot updates
- System logs shadow decisions only

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
