---
phase: 03-dashboard-cost-tracking
plan: "02"
subsystem: database
tags: [token-logging, llm-logger, supabase, ai-sdk, cost-tracking]

# Dependency graph
requires:
  - phase: 03-01
    provides: "Token columns (prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd) added to llm_logs table via SQL migration"
provides:
  - "logLLMInteraction() accepts 4 optional token params (promptTokens, completionTokens, totalTokens, estimatedCostUsd)"
  - "Token data captured from all generateText() calls in route.ts and written to llm_logs Supabase table"
  - "handleMaidHireStateMachine() returns token fields in result object"
affects:
  - 03-03-dashboard
  - 03-04-cost-metrics

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI SDK v6 usage object: usage.inputTokens / usage.outputTokens (NOT v3 names promptTokens/completionTokens)"
    - "PER_1K_TOKENS=0 placeholder for Gemma free tier; formula ready for future pricing"
    - "camelCase TypeScript params mapped to snake_case Supabase columns (promptTokens -> prompt_tokens)"

key-files:
  created: []
  modified:
    - src/lib/llm-logger.ts
    - src/app/api/chat/route.ts

key-decisions:
  - "AI SDK v6 usage property names: inputTokens/outputTokens — NOT v3 names promptTokens/completionTokens"
  - "estimatedCostUsd always 0 (Gemma 3 27B is free as of 2026-02); PER_1K_TOKENS=0 placeholder ready"
  - "Force-escalate early return returns promptTokens/completionTokens/totalTokens as zeros (no LLM call made)"
  - "newState: string added to handleMaidHireStateMachine return type (linter-driven, needed by later plans)"

patterns-established:
  - "Token capture pattern: destructure usage from generateText(), compute with inputTokens/outputTokens, pass to logLLMInteraction()"
  - "Optional token params with ?? null fallback: pre-existing callers unaffected, new rows have non-null values"

requirements-completed: [COST-01, COST-03]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 3 Plan 02: Token Logging Summary

**Token counts captured from all Gemini generateText() calls via AI SDK v6 usage object and written to llm_logs.prompt_tokens / completion_tokens / total_tokens columns**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T06:28:01Z
- **Completed:** 2026-02-28T06:31:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended `logLLMInteraction()` with 4 optional token params, maintaining backward compatibility with all existing callers
- Captured `usage` from both `generateText()` call sites in route.ts (maid_hire path + non-maid-hire path)
- `handleMaidHireStateMachine()` return type extended to include token fields; force-escalate early return returns zeros
- Token data now flows: `generateText()` → `usage.inputTokens/outputTokens` → `logLLMInteraction({ promptTokens, completionTokens, totalTokens, estimatedCostUsd })` → Supabase `llm_logs`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend logLLMInteraction() with optional token params** - `80249f9` (feat)
2. **Task 2: Capture token usage from generateText() in route.ts** - `497d2ed` (feat)
3. **Fix: Add newState to return type (linter-driven correction)** - `b62cae7` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/lib/llm-logger.ts` - Added promptTokens, completionTokens, totalTokens, estimatedCostUsd optional params; mapped to snake_case Supabase columns with `?? null` fallback
- `src/app/api/chat/route.ts` - Destructured `usage` from both generateText() calls; computed token values using AI SDK v6 names; passed token data to logLLMInteraction() at both call sites; extended handleMaidHireStateMachine return type

## Decisions Made
- Used AI SDK v6 property names `usage.inputTokens` / `usage.outputTokens` (not v3 names `promptTokens`/`completionTokens`)
- `estimatedCostUsd` is always 0 — Gemma 3 27B is free; `PER_1K_TOKENS = 0` placeholder in code for future pricing
- All token params are optional (`??  null`) so pre-Phase-3 llm_logs rows remain unaffected (NULL distinguishes old from new)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error from linter-added newState field**
- **Found during:** Task 2 post-commit (linter modified route.ts)
- **Issue:** Linter added `newState: result.newState` to both return objects in `handleMaidHireStateMachine()` but did not add it to the return type declaration, causing `TS2353: Object literal may only specify known properties`
- **Fix:** Added `newState: string` to the `Promise<{...}>` return type annotation
- **Files modified:** `src/app/api/chat/route.ts`
- **Verification:** `npx tsc --noEmit` passes (only pre-existing dashboard error remains)
- **Committed in:** `b62cae7`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug fix for linter-introduced TypeScript error)
**Impact on plan:** Necessary to keep TypeScript clean. The newState field is used by later plans and was a correct addition; only the type declaration needed updating.

## Issues Encountered
- Pre-existing TypeScript error in `src/app/dashboard/page.tsx` (line 138: `Cannot find name 'ProductHealth'`) — out of scope for this plan, deferred

## User Setup Required
None - no external service configuration required. Token columns were created in 03-01 migration. Code now populates them automatically.

## Next Phase Readiness
- `llm_logs` rows will have non-null `prompt_tokens`, `completion_tokens`, `total_tokens` after any maid_hire or non-maid-hire chat turn
- `estimated_cost_usd` is always 0 (Gemma free tier) with formula placeholder ready for future pricing
- Dashboard (03-03) can now query `SELECT SUM(total_tokens), SUM(estimated_cost_usd) FROM llm_logs` for cost metrics
- COST-01 and COST-03 requirements fulfilled

---
*Phase: 03-dashboard-cost-tracking*
*Completed: 2026-02-28*
