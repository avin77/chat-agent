---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-02T08:41:21.729Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 10
  completed_plans: 10
---

# EzyBot — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Capture quality domestic help leads while maintaining natural, helpful conversation
**Current focus:** Phase 3 — Dashboard & Cost Tracking (Phase 2 deferred)

## Current Status

**Phase:** 2 of 4 (Phase 2, Plan 2 of 3 complete — IN PROGRESS)
**Milestone:** v2.0 Agentic Architecture

| Phase | Status |
|-------|--------|
| 1 — LLM Extraction Integration | COMPLETE (2/2 plans done) |
| 2 — Agentic Tool-Calling Flow | In Progress (2/3 plans done) |
| 3 — Dashboard & Cost Tracking | COMPLETE (5/5 plans done) |
| 4 — Data Flywheel Scripts | Pending |

## Already Shipped (This Cycle)

- Location fuzzy matching (Levenshtein) in `src/extractors/dataExtractor.ts`
- Session resume 4h TTL reset in `src/app/api/chat/route.ts` + `ChatWidget.tsx`
- 10 new eval edge cases (c32–c41) in `data/state-golden-dataset.json`
- LLM extractor infrastructure: `src/extractors/llmExtractor.ts`
- Phase 1 complete: LLM-first extraction wired into maid_hire path, extractionMeta logged to Supabase (eval: 99% PRODUCTION READY)
- Phase 3 Plan 01: `supabase-migration-phase3.sql` — token columns on llm_logs, shadow_logs table, system_alerts table (run in Supabase SQL Editor)
- Phase 3 Plan 02: Token capture wired — `logLLMInteraction()` extended with 4 token params; `generateText()` usage captured at both call sites in route.ts
- Phase 3 Plan 03: `intentClassifier.ts` + `shadowHandler.ts` — mid-flow intent classification, confusion tracking, async shadow comparison. Commits: 7dd3435, 087dbeb.
- Phase 3 Plan 04: Product Health tab fully implemented. 4 new server actions (getTokenCostMetrics, getShadowMetrics, getSystemAlerts, checkAndWriteAlerts). getProductHealthMetrics() extended with fieldStats + p50. Commits: b424b5c, d1026e9.
- Phase 3 Plan 05: End-to-end human verification complete. Supabase migration applied (token columns + shadow_logs + system_alerts confirmed live). Token data confirmed in llm_logs after real conversation. Product Health tab confirmed operational. PHASE 3 COMPLETE.

## Decisions

- 2026-02-28 [03-01]: Token columns on llm_logs are nullable with no DEFAULT — NULL distinguishes pre-Phase3 from post-Phase3 rows
- 2026-02-28 [03-01]: shadow_logs schema taken verbatim from CONTEXT.md locked decision (10 columns + gen_random_uuid PRIMARY KEY)
- 2026-02-28 [03-01]: system_alerts severity/alert_type enforced at application layer, not DB constraint (for flexibility)
- 2026-02-27 [01-01]: phone→regex wins in mergeWithConflictResolution (deterministic digit extraction more reliable than LLM)
- 2026-02-27 [01-01]: LLM wins for location/service_type/schedule/salary_range/family_size/has_experience fields
- 2026-02-27 [01-01]: extractionMeta optional in logLLMInteraction — all existing callers unchanged
- 2026-02-27 [01-01]: extraction_meta Supabase insert safe before migration — column added in plan 02
- 2026-02-27 [01-02]: buildSourceMap takes 2 params (mergedSlots, llmSlots) — plan spec had 3 params; used actual implementation signature
- 2026-02-27 [01-02]: geminiRateLimiter.recordRequest() called twice per maid_hire turn (main LLM + extraction LLM) — accurate tracking
- 2026-02-27 [01-02]: Promise.race 10s timeout on LLM extraction — fallback_triggered:true sets sentinel values on any error/timeout
- [Phase 03-02]: AI SDK v6 usage property names: inputTokens/outputTokens — NOT v3 names promptTokens/completionTokens
- [Phase 03-02]: estimatedCostUsd always 0 (Gemma 3 27B is free); PER_1K_TOKENS=0 placeholder ready for future pricing
- 2026-02-28 [03-03]: __confusion stored in CollectedData via existing index signature — no DB migration, no MaidHiringFlow.ts change needed
- 2026-02-28 [03-03]: Shadow handler fires before return with .catch() — fire-and-forget pattern protecting production latency
- 2026-02-28 [03-03]: Classifier skips START and COMPLETE states — only runs mid-flow (ASK_PHONE through ASK_EXPERIENCE)
- 2026-02-28 [03-04]: errors state variable (not errorMetrics) is the correct name in page.tsx — plan spec used wrong name, corrected in implementation
- 2026-02-28 [03-04]: checkAndWriteAlerts() called after setters complete with .catch() — fire-and-forget so alert writes do not delay page data display
- 2026-02-28 [03-04]: DAILY_TOKEN_BUDGET_USD env var defaults to 0 — cost alert never fires for Gemma (free tier) but logic present for future pricing
- 2026-02-28 [03-05]: Supabase migration confirmed applied by human — token columns + shadow_logs + system_alerts tables live in production database
- 2026-02-28 [03-05]: Phase 3 end-to-end verified — token logging, dashboard Product Health tab, and migration all confirmed operational
- [Phase 02-agentic-tool-calling-flow]: Inline validator copies in agenticMaidHire.ts (not imported from MaidHiringFlow.ts) to avoid coupling
- [Phase 02-agentic-tool-calling-flow]: toolChoice='auto' not 'required' — allows LLM text responses for FAQ handling without forcing tool calls
- [Phase 02-agentic-tool-calling-flow]: Loop detection (FLOW-06) counts ALL tool calls per tool name including failures — 3+ calls triggers __loop_detected flag for deterministic fallback
- 2026-03-01 [02-02]: USE_AGENTIC=true routes maid_hire to handleMaidHireAgentic(); false/unset keeps deterministic path 100% intact
- 2026-03-01 [02-02]: handleMaidHireSuccess() helper deduplicates logging/escalation/response code instead of copy-pasting block into catch
- 2026-03-01 [02-02]: Outer catch on useAgenticThisTurn=true calls handleMaidHireStateMachine() as single-turn fallback — not a text fallback
- 2026-03-01 [02-02]: collected_via uses 'agentic' | 'state_machine' parameter passed to handleMaidHireSuccess()

## Session Log

- 2026-02-27: Project initialized. Codebase mapped. Requirements defined. Roadmap created (4 phases).
- 2026-02-27: Phase 1 context gathered (CONTEXT.md committed). Phase 2 deferred by user. Phase 3 PRD saved — ready to plan.
- Phase 3 expanded: Token logging + Dashboard + Shadow Mode Alignment + Conversation Robustness + Alert Thresholds.
- Phase 4 (Flywheel) deferred to future milestone per user.
- RESUME: /gsd:list-phase-assumptions 3 was invoked but not completed (context exhausted mid-read).
- 2026-02-27: Completed Phase 1 Plan 01 — phone bug fixed, ExtractionMeta type + conflict-resolution merge functions added, llm-logger extended. Commits: 63fef22, b43d17e.
- 2026-02-27: Completed Phase 1 Plan 02 — LLM-first extraction wired into route.ts maid_hire path, extractionMeta flows to llm_logs. Eval: 99% PRODUCTION READY (39 convs, 168 turns). Commit: b1f77e7.
- PHASE 1 COMPLETE. Next: Phase 2 (Agentic Tool-Calling) or Phase 3 (Dashboard & Cost Tracking) — user to decide.
- 2026-02-28: Completed Phase 3 Plan 01 — supabase-migration-phase3.sql created. Adds token columns to llm_logs, creates shadow_logs and system_alerts tables. Commit: 48e512d.
- 2026-02-28: Completed Phase 3 Plan 02 — Token logging wired. logLLMInteraction() extended with token params; token capture from all generateText() calls in route.ts. Commits: 80249f9, 497d2ed, b62cae7.
- 2026-02-28: Completed Phase 3 Plan 03 — intentClassifier.ts + shadowHandler.ts created. Classifier integrated in route.ts with confusion tracking. Shadow fires async. Commits: 7dd3435, 087dbeb.
- 2026-02-28: Completed Phase 3 Plan 04 — Product Health tab fully implemented in /dashboard. 4 new server actions, Product Health tab with KPI cards, slot fill rates, token cost, shadow panel with gate checklist. Commits: b424b5c, d1026e9.
- 2026-02-28: Completed Phase 3 Plan 05 — Human verification checkpoint approved. Supabase migration applied, token logging confirmed live, Product Health tab operational. PHASE 3 COMPLETE.
- 2026-02-28: Completed Phase 2 Plan 01 — agenticMaidHire.ts created. 8 tools (save_phone, save_location, save_service_type, save_schedule, save_salary_range, save_family_size, save_has_experience, escalate) + handleMaidHireAgentic() with force-escalate, loop detection, guardrails. Commit: deecb40.
- 2026-03-01: Completed Phase 2 Plan 02 — USE_AGENTIC routing wired into route.ts. supabase-migration-phase2.sql created. handleMaidHireSuccess() helper added. TypeScript and build pass. Commits: 7ae043e, 64c7cad.

---
*Last updated: 2026-03-01T05:14:00Z — Phase 2 Plan 02 COMPLETE (2/3 plans). Next: Phase 2 Plan 03 (human verification checkpoint — Supabase migration + end-to-end test).*
