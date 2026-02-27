# EzyBot — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Capture quality domestic help leads while maintaining natural, helpful conversation
**Current focus:** Phase 3 — Dashboard & Cost Tracking (Phase 2 deferred)

## Current Status

**Phase:** 1 of 4
**Milestone:** v2.0 Agentic Architecture

| Phase | Status |
|-------|--------|
| 1 — LLM Extraction Integration | COMPLETE (2/2 plans done) |
| 2 — Agentic Tool-Calling Flow | Pending |
| 3 — Dashboard & Cost Tracking | Pending |
| 4 — Data Flywheel Scripts | Pending |

## Already Shipped (This Cycle)

- Location fuzzy matching (Levenshtein) in `src/extractors/dataExtractor.ts`
- Session resume 4h TTL reset in `src/app/api/chat/route.ts` + `ChatWidget.tsx`
- 10 new eval edge cases (c32–c41) in `data/state-golden-dataset.json`
- LLM extractor infrastructure: `src/extractors/llmExtractor.ts`
- Phase 1 complete: LLM-first extraction wired into maid_hire path, extractionMeta logged to Supabase (eval: 99% PRODUCTION READY)

## Decisions

- 2026-02-27 [01-01]: phone→regex wins in mergeWithConflictResolution (deterministic digit extraction more reliable than LLM)
- 2026-02-27 [01-01]: LLM wins for location/service_type/schedule/salary_range/family_size/has_experience fields
- 2026-02-27 [01-01]: extractionMeta optional in logLLMInteraction — all existing callers unchanged
- 2026-02-27 [01-01]: extraction_meta Supabase insert safe before migration — column added in plan 02
- 2026-02-27 [01-02]: buildSourceMap takes 2 params (mergedSlots, llmSlots) — plan spec had 3 params; used actual implementation signature
- 2026-02-27 [01-02]: geminiRateLimiter.recordRequest() called twice per maid_hire turn (main LLM + extraction LLM) — accurate tracking
- 2026-02-27 [01-02]: Promise.race 10s timeout on LLM extraction — fallback_triggered:true sets sentinel values on any error/timeout

## Session Log

- 2026-02-27: Project initialized. Codebase mapped. Requirements defined. Roadmap created (4 phases).
- 2026-02-27: Phase 1 context gathered (CONTEXT.md committed). Phase 2 deferred by user. Phase 3 PRD saved — ready to plan.
- Phase 3 expanded: Token logging + Dashboard + Shadow Mode Alignment + Conversation Robustness + Alert Thresholds.
- Phase 4 (Flywheel) deferred to future milestone per user.
- RESUME: /gsd:list-phase-assumptions 3 was invoked but not completed (context exhausted mid-read).
- 2026-02-27: Completed Phase 1 Plan 01 — phone bug fixed, ExtractionMeta type + conflict-resolution merge functions added, llm-logger extended. Commits: 63fef22, b43d17e.
- 2026-02-27: Completed Phase 1 Plan 02 — LLM-first extraction wired into route.ts maid_hire path, extractionMeta flows to llm_logs. Eval: 99% PRODUCTION READY (39 convs, 168 turns). Commit: b1f77e7.
- PHASE 1 COMPLETE. Next: Phase 2 (Agentic Tool-Calling) or Phase 3 (Dashboard & Cost Tracking) — user to decide.

---
*Last updated: 2026-02-27*
