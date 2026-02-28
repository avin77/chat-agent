---
phase: 03-dashboard-cost-tracking
plan: "04"
subsystem: ui
tags: [nextjs, supabase, dashboard, product-health, token-cost, shadow-mode, alerts]

# Dependency graph
requires:
  - phase: 03-02
    provides: Token columns on llm_logs (prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd)
  - phase: 03-03
    provides: shadow_logs table, system_alerts table, intentClassifier, shadowHandler

provides:
  - Product Health tab fully rendered in /dashboard with all 5 sections
  - getTokenCostMetrics() — queries llm_logs for token usage and estimated daily cost
  - getShadowMetrics() — queries shadow_logs for agreement rate, 7-day trend, isReady gate
  - getSystemAlerts() — reads unresolved system_alerts from last 24h
  - checkAndWriteAlerts() — evaluates 5 alert thresholds and inserts to system_alerts on each dashboard load
  - getProductHealthMetrics() extended with fieldStats (filled/skipped/total per field) and p50SessionDurationMs

affects:
  - 03-05 (phase 3 plan 5 — final phase wrap-up)
  - phase-02 (agentic upgrade — shadow readiness gate conditions now visible)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - fire-and-forget checkAndWriteAlerts() called with .catch() after Promise.all setters — alert writes don't block page load
    - errors state variable (existing) reused in product_health tab for fallback_rate and LLM error rate KPIs
    - fieldDetailStats loop runs over sessions array (already fetched) — no extra DB query for slot fill detail

key-files:
  created: []
  modified:
    - src/app/dashboard/actions.ts
    - src/app/dashboard/page.tsx

key-decisions:
  - "errors state variable (not errorMetrics) is the correct variable name for ErrorMetrics in page.tsx — plan spec used wrong name, corrected"
  - "checkAndWriteAlerts() called after setters complete with .catch() — fire-and-forget so alert writes do not delay page data display"
  - "DAILY_TOKEN_BUDGET_USD env var defaults to 0 — cost alert never fires for Gemma (free tier) but logic present for future pricing"
  - "Gate conditions checklist in shadow panel: 2 auto-computed (overall >= 95%, no day < 90%), 3 manual checks — labeled as manual/always-false"

patterns-established:
  - "Product Health tab pattern: KPI cards + per-field bar chart + token cost section + shadow panel + additional metrics grid"
  - "Alert banner pattern: space-y-2 list, severity-conditional red/yellow color classes, positioned at top of product_health tab"

requirements-completed:
  - DASH-01
  - DASH-02
  - DASH-03
  - DASH-04
  - DASH-05
  - SHADOW-02
  - SHADOW-03
  - SHADOW-04
  - ALERT-01
  - ALERT-02
  - ALERT-03
  - ALERT-04

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 3 Plan 04: Product Health Tab — Complete Dashboard Summary

**Product Health tab fully implemented with KPI cards (fallback rate, LLM error rate, lead completion, quality score), slot fill rate bars, token cost section, shadow alignment panel with gate checklist, and auto-alert writing on every dashboard load**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-28T06:34:49Z
- **Completed:** 2026-02-28T06:37:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `getProductHealthMetrics()` with per-field `fieldStats` (filled/skipped/total) and `p50SessionDurationMs`
- Added 4 new server actions: `getTokenCostMetrics`, `getShadowMetrics`, `getSystemAlerts`, `checkAndWriteAlerts`
- `checkAndWriteAlerts()` evaluates 5 alert conditions (fallback rate, LLM error rate, eval regression, cost budget, shadow alignment) and inserts rows to `system_alerts` on every dashboard load
- Complete Product Health tab render block: system alerts banner, 6 KPI cards, slot fill rate chart, token cost section, shadow panel with 7-day trend and gate checklist, additional health metrics

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend actions.ts with new server actions** - `b424b5c` (feat)
2. **Task 2: Add Product Health tab render block to page.tsx** - `d1026e9` (feat)

## Files Created/Modified

- `src/app/dashboard/actions.ts` — Extended getProductHealthMetrics() + 4 new exports (getTokenCostMetrics, getShadowMetrics, getSystemAlerts, checkAndWriteAlerts) + DAILY_TOKEN_BUDGET_USD constant
- `src/app/dashboard/page.tsx` — Added 6 interfaces (FieldStats, ProductHealth, TokenCostMetrics, ShadowDay, ShadowMetrics, SystemAlert), 3 state variables, extended fetchAll() with 3 new fetches + fire-and-forget alert check, added complete product_health tab render block (226 new lines)

## Decisions Made

- **`errors` state variable name:** Plan spec referenced `errorMetrics` in the JSX, but the actual page.tsx state variable is `errors` (from `useState<ErrorMetrics | null>`). Corrected to use `errors` throughout the product_health tab.
- **`checkAndWriteAlerts()` placement:** Called after all setters complete, not inside the Promise.all, with `.catch()` — ensures data fetches complete first and alert writes never block page load.
- **Gate conditions checklist:** 2 gates auto-compute from shadow data (overall >= 95%, no day < 90%); the other 3 are manual checks labeled accordingly with `pass: false` or `pass: true` as documented.
- **Token cost display:** When `logsWithTokens === 0`, shows "No token data yet" message instead of zeros — better UX for fresh deployments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `errorMetrics` variable reference to `errors`**
- **Found during:** Task 2 (Product Health tab JSX implementation)
- **Issue:** Plan spec referenced `errorMetrics` in the fallback_rate and LLM error rate StatCard JSX, but the actual state variable in page.tsx is `errors` (declared as `const [errors, setErrors] = useState<ErrorMetrics | null>(null)`)
- **Fix:** Used `errors` (correct variable name) in all product_health tab JSX references
- **Files modified:** src/app/dashboard/page.tsx
- **Verification:** TypeScript compiles without errors; `npm run build` passes
- **Committed in:** d1026e9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: wrong variable name in plan spec)
**Impact on plan:** Fix was essential for correct TypeScript compilation. No scope creep.

## Issues Encountered

None — build passed on first attempt after the variable name correction.

## User Setup Required

None — no new environment variables required (DAILY_TOKEN_BUDGET_USD is optional, defaults to 0).

## Next Phase Readiness

- Product Health tab now fully operational — all 5 sections render with real or empty-state data
- `checkAndWriteAlerts()` will auto-populate `system_alerts` table on first dashboard load
- Shadow alignment panel shows "Not Ready" with gate conditions until shadow_logs accumulates data
- Token cost section shows "No token data yet" until Phase 3 token capture (Plan 02) has logged conversations
- Phase 3 Plan 05 (if any) can proceed — all data infrastructure and UI complete

---
*Phase: 03-dashboard-cost-tracking*
*Completed: 2026-02-28*

## Self-Check: PASSED

**Files verified:**
- FOUND: src/app/dashboard/actions.ts (contains getTokenCostMetrics, getShadowMetrics, getSystemAlerts, checkAndWriteAlerts, fieldStats, p50SessionDurationMs, DAILY_TOKEN_BUDGET_USD)
- FOUND: src/app/dashboard/page.tsx (contains product_health tab render, TokenCostMetrics, ShadowMetrics, SystemAlert interfaces, checkAndWriteAlerts call, Fallback Rate KPI, LLM Error Rate KPI, Slot Fill Rates, Gate Conditions)

**Commits verified:**
- FOUND: b424b5c (Task 1 — actions.ts)
- FOUND: d1026e9 (Task 2 — page.tsx)

**Build verified:** `npm run build` passed cleanly — no TypeScript errors, all 9 routes generated successfully.
