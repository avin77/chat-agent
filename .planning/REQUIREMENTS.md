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

- [ ] **FLOW-01**: `handleMaidHireAgentic()` in `src/flows/agenticMaidHire.ts` implements LLM tool-calling with 8 tools: collect_phone, collect_location, collect_service, collect_schedule, collect_salary, collect_family, collect_experience, escalate_lead
- [ ] **FLOW-02**: `USE_AGENTIC=true` env var routes maid_hire to agentic handler; false/absent uses deterministic
- [ ] **FLOW-03**: Agentic flow reads and writes session to Supabase (same `conversation_sessions` schema)
- [ ] **FLOW-04**: Agentic flow applies guardrails.ts post-processing (price blocking, phone validation)
- [ ] **FLOW-05**: Force-escalate triggered after 3 consecutive failed tool calls (same `shouldForceEscalate` threshold)
- [ ] **FLOW-06**: Fallback to deterministic mode if same tool called 3+ times in one session (loop detection)

### Token Cost Tracking

- [ ] **COST-01**: `generateText()` usage object captured — promptTokens, completionTokens, totalTokens stored
- [x] **COST-02**: `llm_logs` table has new columns: `prompt_tokens` (int), `completion_tokens` (int), `total_tokens` (int), `estimated_cost_usd` (float8)
- [ ] **COST-03**: `logLLMInteraction()` in `src/lib/llm-logger.ts` accepts and stores token fields

### Product Health Dashboard

- [ ] **DASH-01**: Product Health tab displays lead completion rate, lead quality score (0–100), effective escalation rate
- [ ] **DASH-02**: Slot-by-slot fill rate bar visualization (% of maid_hire sessions that collected each of 7 fields)
- [ ] **DASH-03**: Session duration shown: avg and p50 derived from existing `created_at`/`last_activity` columns
- [ ] **DASH-04**: Token cost metrics visible: cost per conversation, daily token spend estimate
- [ ] **DASH-05**: `getProductHealthMetrics()` in `actions.ts` returns `fieldStats` with filled/failed/skipped counts per field

### Data Flywheel

- [ ] **FLY-01**: `scripts/mine-missed-extractions.js` queries sessions where `attempts > 0` and outputs rejected/accepted message pairs per state to `data/missed-extractions-YYYY-MM-DD.json`
- [ ] **FLY-02**: `scripts/mine-golden-from-prod.js` reconstructs COMPLETE maid_hire sessions from `llm_logs`, hashes PII, outputs to `data/mined-golden-YYYY-MM-DD.json`
- [ ] **FLY-03**: `scripts/analyze-guardrail-mods.js` groups `llm_logs` by state where raw ≠ after_guardrails, ranks states by guardrail trigger rate
- [ ] **FLY-04**: `package.json` has `"mine"` script that runs all three scripts sequentially

## v2 Requirements

### Advanced Agentic (defer until Phase 2 has 2+ weeks prod data)

- **ADVA-01**: Multi-intent orchestration (complaint + hire in same session)
- **ADVA-02**: Zero-shot new intent handling without code changes
- **ADVA-03**: LLM-generated contextual error messages per field (replace hardcoded errorMessage)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Phase 3 multi-intent agentic | Needs 2+ weeks of Phase 2 prod data first |
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
| FLOW-01 | Phase 2 | Pending |
| FLOW-02 | Phase 2 | Pending |
| FLOW-03 | Phase 2 | Pending |
| FLOW-04 | Phase 2 | Pending |
| FLOW-05 | Phase 2 | Pending |
| FLOW-06 | Phase 2 | Pending |
| COST-01 | Phase 3 | Pending |
| COST-02 | Phase 3 | Complete |
| COST-03 | Phase 3 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 3 | Pending |
| FLY-01 | Phase 4 | Pending |
| FLY-02 | Phase 4 | Pending |
| FLY-03 | Phase 4 | Pending |
| FLY-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after initial definition*
