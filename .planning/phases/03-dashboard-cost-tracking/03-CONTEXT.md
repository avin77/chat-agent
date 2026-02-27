# Phase 3: Dashboard & Cost Tracking - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/phases/03-dashboard-cost-tracking/03-PRD.md)

<domain>
## Phase Boundary

Phase 3 delivers full production observability, cost tracking, and shadow alignment testing before enabling any autonomous tool-calling. Specifically:
- Token logging added to `llm_logs` (4 new columns)
- Product Health dashboard tab populated with live metrics
- Shadow mode alignment testing infrastructure (silent parallel execution)
- Conversation robustness layer (message classification to prevent looping)
- Alert threshold system (fallback rate, LLM errors, cost anomalies, alignment drops)

</domain>

<decisions>
## Implementation Decisions

### Token Logging (llm_logs schema extension)
- Add `prompt_tokens` (int) to llm_logs
- Add `completion_tokens` (int) to llm_logs
- Add `total_tokens` (int) to llm_logs
- Add `estimated_cost_usd` (decimal) to llm_logs
- Capture `usage` from `generateText()` in `src/app/api/chat/route.ts`
- Pass token counts to `src/lib/llm-logger.ts`

### Dashboard Metrics (Product Health tab)
- Lead completion rate — show with real numbers
- Slot fill rate per field — `salary_range` expected to be most-skipped
- Lead quality score
- Escalation rate (effective)
- Average session duration (maid_hire conversations)
- Average tokens per conversation
- Fallback rate
- LLM error rate
- Shadow alignment % (once shadow mode active)

### Shadow Mode Architecture
- Shadow path runs ASYNC after production response is already sent — zero latency impact
- Production path: `extractAllSlotsWithLLM()` → `handleMaidHireStateMachine()` → `guardrails.ts` → response to user
- Shadow path: same message + session state → `shadowAgenticHandler()` → compare vs production → log to `shadow_logs`
- `shadowAgenticHandler()` calls Gemini, proposes: `next_state`, `tool_calls`, `slots`
- Environment flag `USE_AGENTIC` controls whether shadow is active (default false in Phase 3)

### Shadow Logs Table (new Supabase table)
```sql
CREATE TABLE shadow_logs (
  id              uuid DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  turn_number     int,
  current_state   text,
  user_message    text,
  prod_next_state text,
  prod_slots      jsonb,
  shadow_proposal jsonb,
  agreed          boolean,
  shadow_latency_ms int,
  created_at      timestamptz DEFAULT now()
);
```

### Shadow Dashboard Panel
- Overall agreement % (last 7 days)
- State transition agreement %
- Slot extraction agreement %
- Escalation agreement %
- 7-day trend
- Agentic readiness indicator (green ✓ if ≥95% for 7 consecutive days)
- Checklist: all 5 gate conditions to enable USE_AGENTIC=true

### Gate Conditions Before USE_AGENTIC=true
1. Overall agreement ≥ 95% (last 7 days)
2. No single day below 90%
3. No cost anomaly (shadow avg tokens < 2× production avg)
4. No repeated invalid tool proposals (same wrong tool > 3× in one day)
5. Manual spot-check of 10 disagreed turns

### Conversation Robustness Layer
- New file: `src/extractors/intentClassifier.ts` — lightweight LLM classification
- Categories: `expected_slot_answer`, `new_intent`, `meta_question`, `clarification_request`, `off_topic`, `abusive`, `unknown`
- Run classifier BEFORE state machine processes input
- After 2 consecutive irrelevant answers in same state → offer restart or support
- Add confusion counter to state in `src/flows/MaidHiringFlow.ts`
- Integrate into `src/app/api/chat/route.ts`

### Alert Thresholds
- Fallback rate > 5% → alert
- LLM error rate > 1% → alert
- Eval regression < 95% → alert
- Daily token spend exceeds budget → alert
- Shadow alignment drops below 95% → alert
- Alert delivery: console log + Supabase `system_alerts` table (new) OR dashboard banner

### Claude's Discretion
- Exact Gemini model for shadow handler (likely same `gemma-3-27b-it`)
- Implementation of `shadowAgenticHandler()` internals — tool-use schema design
- Alert threshold storage format (table schema for `system_alerts`)
- Dashboard UI layout for the new shadow panel and alert section
- Whether to use polling or real-time for dashboard refresh

</decisions>

<specifics>
## Specific Ideas

**Token cost formula:** Gemini pricing for `gemma-3-27b-it` — calculate `estimated_cost_usd` from token counts

**Shadow mode mental model (from PRD):** "Think of it like a student shadowing a doctor. The doctor (deterministic state machine) makes all real decisions. The student (agentic handler) watches each case, writes down what they would have done."

**Conversation robustness example:**
- State: ASK_LOCATION
- User: "How much does this cost?"
- Old: "Please share your location."
- New: "Our pricing depends on your area. Could you share your location first?"

**Files to modify:**
- `src/lib/llm-logger.ts` — add token params
- `src/app/api/chat/route.ts` — capture usage, integrate classifier, shadow path
- `src/app/dashboard/actions.ts` — implement `getProductHealthMetrics()` fully
- `src/app/dashboard/page.tsx` — populate Product Health tab, add shadow panel
- `src/flows/MaidHiringFlow.ts` — add confusion counter to state
- Supabase migration — 4 columns to llm_logs + shadow_logs table + system_alerts table

**New files:**
- `src/extractors/intentClassifier.ts`
- `src/lib/shadowHandler.ts` (or similar)

</specifics>

<deferred>
## Deferred Ideas

- Hybrid agentic tool-calling execution (Phase 2 — deferred to future milestone)
- Controlled traffic rollout
- Data flywheel scripts (Phase 4 — deferred)
- Multi-intent orchestration
- Actually flipping USE_AGENTIC=true (that happens after 7-day alignment test passes, not in this phase)

</deferred>

---

*Phase: 03-dashboard-cost-tracking*
*Context gathered: 2026-02-27 via PRD Express Path*
