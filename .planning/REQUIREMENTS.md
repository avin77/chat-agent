# Requirements: EzyBot Agentic Upgrade

**Defined:** 2026-02-27
**Core Value:** Capture quality domestic help leads while maintaining natural, helpful conversation

## v1 Requirements

### Agentic Extraction

- [x] **AGEX-01**: `extractAllSlotsWithLLM()` from `llmExtractor.ts` called first in chat route before regex extractors
- [x] **AGEX-02**: Regex extractors run as fallback for any field where LLM returned null
- [x] **AGEX-03**: LLM extraction API errors (timeout, quota) fall back to regex gracefully — no user-visible failure
- [x] **AGEX-04**: Eval score ≥95% after integration (run `npm run eval:state` to verify) — achieved 99%

### Agentic Flow

- [x] **FLOW-01**: `handleMaidHireAgentic()` in `src/flows/agenticMaidHire.ts` implements LLM tool-calling with 8 tools: collect_phone, collect_location, collect_service, collect_schedule, collect_salary, collect_family, collect_experience, escalate_lead
- [x] **FLOW-02**: `USE_AGENTIC=true` env var routes maid_hire to agentic handler; false/absent uses deterministic
- [x] **FLOW-03**: Agentic flow reads and writes session to Supabase (same `conversation_sessions` schema)
- [x] **FLOW-04**: Agentic flow applies guardrails.ts post-processing (price blocking, phone validation)
- [x] **FLOW-05**: Force-escalate triggered after 3 consecutive failed tool calls (same `shouldForceEscalate` threshold)
- [x] **FLOW-06**: Fallback to deterministic mode if same tool called 3+ times in one session (loop detection)

### Token Cost Tracking

- [x] **COST-01**: `generateText()` usage object captured — promptTokens, completionTokens, totalTokens stored
- [x] **COST-02**: `llm_logs` table has new columns: `prompt_tokens` (int), `completion_tokens` (int), `total_tokens` (int), `estimated_cost_usd` (float8)
- [x] **COST-03**: `logLLMInteraction()` in `src/lib/llm-logger.ts` accepts and stores token fields

### Product Health Dashboard

- [x] **DASH-01**: Product Health tab displays lead completion rate, lead quality score (0–100), effective escalation rate
- [x] **DASH-02**: Slot-by-slot fill rate bar visualization (% of maid_hire sessions that collected each of 7 fields)
- [x] **DASH-03**: Session duration shown: avg and p50 derived from existing `created_at`/`last_activity` columns
- [x] **DASH-04**: Token cost metrics visible: cost per conversation, daily token spend estimate
- [x] **DASH-05**: `getProductHealthMetrics()` in `actions.ts` returns `fieldStats` with filled/failed/skipped counts per field

### Shadow Observability

- [x] **SHADOW-01**: `src/lib/shadowHandler.ts` writes comparison rows to `shadow_logs` without affecting production latency
- [x] **SHADOW-02**: Dashboard shadow panel shows overall agreement and time-sliced trend from `shadow_logs`
- [x] **SHADOW-03**: Shadow readiness indicator turns ready only when agreement stays at or above 95% for 7 consecutive days
- [x] **SHADOW-04**: Dashboard displays rollout gate checklist for shadow readiness and manual review checks

### Conversation Robustness

- [x] **CONV-01**: `src/extractors/intentClassifier.ts` classifies mid-flow turns for confusion, side intents, and off-topic behavior
- [x] **CONV-02**: Classifier runs before deterministic maid-hire state processing on the active production path
- [x] **CONV-03**: After repeated irrelevant or failed answers, the bot offers restart or support instead of looping
- [x] **CONV-04**: Conversation confusion state is persisted in session data for recovery logic and auditability

### Alerting

- [x] **ALERT-01**: Dashboard writes a warning alert when fallback rate exceeds 5% over the alert window
- [x] **ALERT-02**: Dashboard writes a critical alert when LLM error rate exceeds 1% over the alert window
- [x] **ALERT-03**: Dashboard writes a critical alert when latest eval score drops below 95%
- [x] **ALERT-04**: Dashboard writes warning alerts for cost-budget overruns or shadow alignment dropping below 95%

### Data Flywheel

- [x] **FLY-01**: `scripts/mine-missed-extractions.js` queries sessions where `attempts > 0` and outputs rejected/accepted message pairs per state to `data/missed-extractions-YYYY-MM-DD.json`
- [x] **FLY-02**: `scripts/mine-golden-from-prod.js` reconstructs COMPLETE maid_hire sessions from `llm_logs`, hashes PII, outputs to `data/mined-golden-YYYY-MM-DD.json`
- [x] **FLY-03**: `scripts/analyze-guardrail-mods.js` groups `llm_logs` by state where raw ≠ after_guardrails, ranks states by guardrail trigger rate
- [x] **FLY-04**: `package.json` has `"mine"` script that runs all three scripts sequentially

## v2 Requirements (Milestone 3.0)

### Advanced Agentic Orchestration

- [x] **ORCH-01**: Mid-flow intent switches push current intent to `intent_stack` and pop to resume on completion (Phase 6, 14-03)
- [x] **ORCH-02**: Intent stack and history persisted in `conversation_sessions` JSONB columns (Phase 6, 14-01)
- [x] **LANG-01**: Absolute English-only response policy enforced across all intents (Phase 5, 14-01)
- [x] **CONF-01**: Confusion Protocol 2.0 tracks `slot_attempts` and triggers reframe/pivot after 3 failures (Phase 7, 14-03)
- [x] **PLAY-01**: Centralized Response Playbooks define required/optional fields and canonical responses (Phase 8, 14-01)
- [x] **DASH-06**: PM Dashboard surfaces Agentic Quality (loop rate, switch success) and Shadow Readiness signals (Phase 9, 14-04)
- [x] **GOV-01**: Release gates on 3 eval tracks (state, unhappy, normal) via shared governance contract (Phase 10, 14-04)
- [x] **FLY-05**: Flywheel scripts compatible with shared runtime telemetry in `llm_logs` (Phase 11)
- [x] **PAR-01**: Shared agentic runtime provides 100% parity across `maid_hire`, `complaint`, and `maid_registration` (Phase 14-01, 14-02, 14-03)
- [x] **SHAD-05**: Shadow mode uses the identical runtime contract as production for faithful agreement tracking (Phase 14-02)
- [x] **FIX-01**: Polished runtime handles `general` intent suspension and naturalized completion responses (Phase 14-05)

## v3 Requirements (Milestone 4.0)

### Production Promotion & Scaling

- [ ] **ROLL-01**: Default `USE_AGENTIC=true` for all production users (Phase 16)
- [ ] **ROLL-02**: Decommissioning of legacy deterministic flow handlers (Phase 16)
- [ ] **FLY-06**: Mining scripts refactored for all canonical intents (Phase 15)
- [ ] **FLY-07**: Cross-intent performance comparisons enabled in flywheel analysis (Phase 15)
- [ ] **SHAD-06**: Shadow simulation for agentic turns enabled (model-vs-model) (Phase 17)
- [ ] **SHAD-07**: Dashboard visualization for agentic shadow agreement trends (Phase 17)
- [ ] **UNH-01**: Complex multi-intent cases added to `eval-unhappy` suite (Phase 18)
- [ ] **UNH-02**: Intent stack robustness verified against nested (>2 deep) suspensions (Phase 18)
- [ ] **DEBT-03**: `BaseFlow.ts` and `MaidHiringFlow.ts` deleted from codebase (Phase 19)
- [ ] **DEBT-04**: Redundant deterministic state-machine code (~200+ lines) removed (Phase 19)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Phase 4 multi-intent agentic | Deferred to future milestone |
| Supabase real-time subscriptions | Batch analytics sufficient |
| Mobile app | Web-first, deferred |
| Playwright UI eval | Already exists as separate test suite |
| Auto DB writes from flywheel | Human review required before any production changes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGEX-01 | Phase 1 | Complete |
| AGEX-02 | Phase 1 | Complete |
| AGEX-03 | Phase 1 | Complete |
| AGEX-04 | Phase 1 | Complete |
| FLOW-01 | Phase 2 | Complete |
| FLOW-02 | Phase 2 | Complete |
| FLOW-03 | Phase 2 | Complete |
| FLOW-04 | Phase 2 | Complete |
| FLOW-05 | Phase 2 | Complete |
| FLOW-06 | Phase 2 | Complete |
| COST-01 | Phase 3 | Complete |
| COST-02 | Phase 3 | Complete |
| COST-03 | Phase 3 | Complete |
| DASH-01 | Phase 3 | Complete |
| DASH-02 | Phase 3 | Complete |
| DASH-03 | Phase 3 | Complete |
| DASH-04 | Phase 3 | Complete |
| DASH-05 | Phase 3 | Complete |
| SHADOW-01 | Phase 3 | Complete |
| SHADOW-02 | Phase 3 | Complete |
| SHADOW-03 | Phase 3 | Complete |
| SHADOW-04 | Phase 3 | Complete |
| CONV-01 | Phase 3 | Complete |
| CONV-02 | Phase 3 | Complete |
| CONV-03 | Phase 3 | Complete |
| CONV-04 | Phase 3 | Complete |
| ALERT-01 | Phase 3 | Complete |
| ALERT-02 | Phase 3 | Complete |
| ALERT-03 | Phase 3 | Complete |
| ALERT-04 | Phase 3 | Complete |
| FLY-01 | Phase 11 | Complete |
| FLY-02 | Phase 11 | Complete |
| FLY-03 | Phase 11 | Complete |
| FLY-04 | Phase 11 | Complete |
| ORCH-01 | Phase 6/14 | Complete |
| ORCH-02 | Phase 6/14 | Complete |
| LANG-01 | Phase 5/14 | Complete |
| CONF-01 | Phase 7/14 | Complete |
| PLAY-01 | Phase 8/14 | Complete |
| DASH-06 | Phase 9/14 | Complete |
| GOV-01 | Phase 10/14 | Complete |
| FLY-05 | Phase 11 | Complete |
| PAR-01 | Phase 14 | Complete |
| SHAD-05 | Phase 14 | Complete |
| FIX-01 | Phase 14 | Complete |
| ROLL-01 | Phase 16 | Pending |
| ROLL-02 | Phase 16 | Pending |
| FLY-06 | Phase 15 | Pending |
| FLY-07 | Phase 15 | Pending |
| SHAD-06 | Phase 17 | Pending |
| SHAD-07 | Phase 17 | Pending |
| UNH-01 | Phase 18 | Pending |
| UNH-02 | Phase 18 | Pending |
| DEBT-03 | Phase 19 | Pending |
| DEBT-04 | Phase 19 | Pending |

**Coverage:**
- requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-03-13 after adding Milestone 4.0*
