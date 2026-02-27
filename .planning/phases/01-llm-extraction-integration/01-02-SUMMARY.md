---
phase: 01-llm-extraction-integration
plan: 02
subsystem: api
tags: [llm-extraction, gemini, slot-filling, rate-limiter, supabase, logging]

requires:
  - phase: 01-llm-extraction-integration
    plan: 01
    provides: [ExtractionMeta, mergeWithConflictResolution, buildSourceMap, extractionMeta-logging]

provides:
  - LLM-first slot extraction in handleMaidHireStateMachine with 10s timeout + regex fallback
  - extractionMeta JSONB field logged to llm_logs.extraction_meta on every maid_hire turn
  - Dual Gemini rate-limiter calls per maid_hire turn (main LLM + extraction LLM)

affects: [route.ts, llm-logger, llm_logs-supabase-table]

tech-stack:
  added: []
  patterns:
    - Promise.race timeout pattern for secondary LLM calls (10s hard limit)
    - extractionMeta propagation through function return -> destructuring -> logLLMInteraction
    - geminiRateLimiter.recordRequest() called twice per maid_hire turn

key-files:
  created: []
  modified:
    - src/app/api/chat/route.ts

key-decisions:
  - "buildSourceMap takes 2 params (mergedSlots, llmSlots) — plan interface spec had 3 params, actual code signature takes 2; used actual signature"
  - "Rate limiter recordRequest() called before extraction LLM call — accurately tracks second Gemini API call per maid_hire turn"
  - "extractionMeta always defined before early-return paths (force-escalate) — try/catch block runs before force-escalate check"

patterns-established:
  - "LLM-first extraction: Promise.race([llmPromise, 10s timeout]) then mergeWithConflictResolution"
  - "Fallback sets fallback_triggered:true, sources:{}, llm_raw:null — consistent sentinel values"
  - "extractionMeta flows: extraction block -> function return -> POST destructuring -> logLLMInteraction"

requirements-completed: [AGEX-01, AGEX-02, AGEX-03, AGEX-04]

duration: 25min
completed: 2026-02-27
---

# Phase 1 Plan 2: Wire LLM Extraction into route.ts Summary

**LLM-first slot extraction (10s timeout, regex fallback, field-level merge) wired into maid_hire path with extractionMeta flowing to Supabase llm_logs; eval score 99% PRODUCTION READY.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-27T12:40:00Z
- **Completed:** 2026-02-27T13:05:00Z
- **Tasks:** 2 completed (Task 1 was human-action, confirmed by user)
- **Files modified:** 1 (src/app/api/chat/route.ts)

## Accomplishments

- Replaced `extractAllSlots(latestMessage)` with LLM-first extraction block using `Promise.race` 10-second timeout
- `mergeWithConflictResolution()` applies trust hierarchy: phone->regex wins, all other fields->LLM wins
- `buildSourceMap(mergedSlots, llmSlots)` records per-field provenance ('llm' or 'regex') for every non-null field
- `extractionMeta` propagates from extraction block through function return, POST handler destructuring, and into `logLLMInteraction()` — flows to `extraction_meta` JSONB column in Supabase `llm_logs`
- `geminiRateLimiter.recordRequest()` called before extraction LLM call — rate limiter accurately tracks both Gemini calls per maid_hire turn
- Eval score: **99% PRODUCTION READY** (168 turns, 8 failed, same failure patterns as pre-integration baseline)

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Supabase migration (human-action) | n/a — manual SQL |
| 2 | Wire LLM extraction into handleMaidHireStateMachine | b1f77e7 |

## Files Created/Modified

- `src/app/api/chat/route.ts` — Added LLM-first extraction block with 10s timeout, fallback to regex, extractionMeta propagation

## Decisions Made

1. **buildSourceMap signature correction:** Plan interface spec described `buildSourceMap(llmSlots, regexSlots, merged)` (3 params), but actual implementation in llmExtractor.ts uses `buildSourceMap(mergedSlots, llmSlots)` (2 params). Used the actual implementation signature — no code change needed to llmExtractor.ts.

2. **Rate limiter double-call:** `geminiRateLimiter.recordRequest()` called before extraction LLM call (inside the try block). The first call happens in the POST handler at line 415 for the main Gemini generation. This is correct: each maid_hire turn makes 2 Gemini API calls (extraction + generation).

3. **extractionMeta always defined before force-escalate return:** The extraction block (step 2) runs after session load (step 1) but before the force-escalate check (step 5). This ensures `extractionMeta` is always in scope for the early return path, avoiding TypeScript "used before assignment" errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected buildSourceMap call signature**
- **Found during:** Task 2 (reading actual llmExtractor.ts before writing code)
- **Issue:** Plan interface section specified `buildSourceMap(llmSlots, regexSlots, merged)` with 3 params. Actual exported function in llmExtractor.ts takes 2 params: `buildSourceMap(mergedSlots, llmSlots)`. Using the 3-param signature would cause a TypeScript compilation error.
- **Fix:** Used correct 2-param call `buildSourceMap(extractedSlots, llmSlots)` where `extractedSlots` is the merged result.
- **Files modified:** src/app/api/chat/route.ts (the call site, not llmExtractor.ts)
- **Verification:** `npx tsc --noEmit` shows zero errors in modified files
- **Committed in:** b1f77e7

---

**Total deviations:** 1 auto-fixed (Rule 1 - interface spec mismatch between plan and implementation)
**Impact on plan:** Required correction. Plan interface spec was written based on intended design; actual plan 01 implementation had a cleaner 2-param API. No behavioral change — semantics identical.

## Issues Encountered

- Pre-existing TypeScript error in `src/app/dashboard/page.tsx` (`ProductHealth` type undefined) — already documented in plan 01-01 SUMMARY as out-of-scope. Not fixed here. Zero errors in modified files.
- Eval runner is slow (~8 minutes for 39 conversations) due to rate limiting between Gemini calls. Double-call per maid_hire turn added ~0.5s to each test turn on average but did not push any conversation over the rate limit.

## Eval Results (Task 3)

**Score: 99% PRODUCTION READY** (39 conversations, 168 turns)

| Category | Result |
|----------|--------|
| State Transitions | 164/168 (98%) |
| Slot Extraction | 168/168 (100%) |
| Slot Validation | 129/129 (100%) |
| Advance Decisions | 164/168 (98%) |
| Failure Handling | 37/38 (97%) |
| No Price Leakage | 165/168 (98%) |

Failed turns (8) — all pre-existing, not caused by LLM extraction:
- c01, c03, c04: Price leaked in LLM response (guardrails missed "₹15k" patterns in certain contexts)
- c28: FAQ mid-flow didn't re-ask ASK_SCHEDULE correctly
- c31: Intent detection advanced to wrong state
- c34: Hinglish flow — LLM skipped location step (NLU issue, not extraction)
- c39: Wrong-city chain — location step skipped after city correction

## User Setup Required

Task 1 (Supabase migration) was confirmed complete by user before Task 2 started:
```sql
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS extraction_meta jsonb;
```

## Next Phase Readiness

- Phase 1 complete: LLM extractor infrastructure fully wired into maid_hire path
- `extraction_meta` now logged on every maid_hire turn — available for analysis
- Ready to proceed to Phase 2 (Agentic Tool-Calling Flow) or Phase 3 (Dashboard & Cost Tracking)
- Rate limiter tracks double-calls — if production 429s increase, consider adjusting extraction timeout threshold

---
*Phase: 01-llm-extraction-integration*
*Completed: 2026-02-27*
