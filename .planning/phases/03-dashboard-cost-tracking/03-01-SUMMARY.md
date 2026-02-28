---
phase: 03-dashboard-cost-tracking
plan: "01"
subsystem: database
tags: [supabase, postgresql, migration, sql, schema]

# Dependency graph
requires: []
provides:
  - "llm_logs token columns: prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd (nullable)"
  - "shadow_logs table with 10 columns + 3 indexes for shadow mode alignment tracking"
  - "system_alerts table with 9 columns + 2 indexes for alert threshold monitoring"
affects: [03-02-token-logging, 03-03-shadow-mode, 03-04-alert-system, 03-05-dashboard-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent SQL migrations using IF NOT EXISTS — safe to re-run in Supabase SQL Editor"
    - "Nullable columns on existing tables preserve backward compatibility (pre-Phase3 rows remain NULL)"

key-files:
  created:
    - supabase-migration-phase3.sql
  modified: []

key-decisions:
  - "Token columns on llm_logs are nullable with no DEFAULT — old rows remain NULL, distinguishing pre-Phase3 from post-Phase3 logs"
  - "shadow_logs schema taken verbatim from CONTEXT.md locked decision (10 columns, gen_random_uuid PRIMARY KEY)"
  - "system_alerts has 3 indexes covering unresolved alerts and time-ordered queries for dashboard"

patterns-established:
  - "Phase 3 schema: all new tables use gen_random_uuid() PRIMARY KEY and timestamptz DEFAULT now() for created_at"
  - "Indexes added for every expected query pattern (time-order, filter by conversation, filter by resolved state)"

requirements-completed: [COST-02]

# Metrics
duration: 1min
completed: 2026-02-28
---

# Phase 3 Plan 01: Supabase Schema Migration Summary

**Idempotent SQL migration adding 4 nullable token-cost columns to llm_logs and creating shadow_logs + system_alerts tables as prerequisites for all Phase 3 plans**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-28T06:24:47Z
- **Completed:** 2026-02-28T06:25:47Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `supabase-migration-phase3.sql` with three idempotent sections
- Added 4 nullable columns to llm_logs: `prompt_tokens INT`, `completion_tokens INT`, `total_tokens INT`, `estimated_cost_usd FLOAT8` — no NOT NULL, no DEFAULT, existing rows unaffected
- Created `shadow_logs` table (10 columns, 3 indexes) for shadow mode alignment tracking
- Created `system_alerts` table (9 columns, 2 indexes) for alert threshold monitoring
- Automated verification confirms all required SQL fragments present

## Task Commits

Each task was committed atomically:

1. **Task 1: Write Supabase migration SQL file** - `48e512d` (feat)

**Plan metadata:** [pending final commit] (docs: complete plan)

## Files Created/Modified
- `supabase-migration-phase3.sql` - Phase 3 Supabase SQL migration: token columns on llm_logs, shadow_logs table, system_alerts table. Run once in Supabase SQL Editor.

## Decisions Made
- Token columns are nullable with no DEFAULT value. This is intentional — it allows code to distinguish pre-Phase3 log rows (NULL) from post-Phase3 rows (populated). Aligns with the plan's CRITICAL note.
- shadow_logs schema taken verbatim from CONTEXT.md locked decision to maintain consistency with the shadow mode design.
- system_alerts severity values will be `'warning'` or `'critical'`; alert_type values will be `'fallback_rate' | 'llm_error_rate' | 'eval_regression' | 'cost_anomaly' | 'shadow_alignment'` — enforced at application layer, not DB constraint (for flexibility).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Bash `!` character escaping prevented inline `node -e` one-liner from running directly. Resolved by writing a temporary `.cjs` verify script, then cleaning it up before commit.

## User Setup Required

**External service requires manual configuration.**

To apply the migration:
1. Open [Supabase SQL Editor](https://supabase.com/dashboard) for the EzyBot project
2. Paste the contents of `supabase-migration-phase3.sql`
3. Click **Run**
4. Verify no errors (all statements use `IF NOT EXISTS`, safe to re-run)

This is a one-time step. Until it is run, Plans 03-02 through 03-05 will not be able to write token data, shadow logs, or alerts to the database.

## Next Phase Readiness
- `supabase-migration-phase3.sql` is ready to run in Supabase SQL Editor
- Once run, all 4 Phase 3 plans (03-02 token logging, 03-03 shadow mode, 03-04 alerts, 03-05 dashboard) can proceed
- No blockers from this plan — schema file is the sole artifact

---
*Phase: 03-dashboard-cost-tracking*
*Completed: 2026-02-28*
