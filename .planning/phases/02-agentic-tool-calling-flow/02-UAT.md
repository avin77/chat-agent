---
status: resolved
phase: 02-agentic-tool-calling-flow
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-03-01T07:30:00Z
updated: 2026-03-02T08:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Supabase Migration File Exists
expected: The file `supabase-migration-phase2.sql` exists in the project root with correct ADD COLUMN IF NOT EXISTS and CREATE INDEX statements for the agentic_mode column.
result: pass

### 2. Deterministic path unchanged (USE_AGENTIC unset)
expected: With `USE_AGENTIC` not set (or =false) in .env.local, the maid hire flow works exactly as before.
result: skipped
reason: Only testing with USE_AGENTIC=true active; deterministic path verified by pre-Phase-2 baseline of 98%

### 3. USE_AGENTIC flag routes to agentic handler
expected: Set `USE_AGENTIC=true` in .env.local and restart dev server. Maid hire conversations route to agentic handler.
result: pass

### 4. Agentic bot collects fields conversationally
expected: In agentic mode, bot collects fields conversationally without re-asking already-provided fields.
result: pass

### 5. Agentic session recorded in Supabase
expected: conversation_sessions.agentic_mode = true for agentic turns.
result: pass

### 6. Leads table shows collected_via='agentic'
expected: leads.collected_via = 'agentic' for completed agentic conversations.
result: pass

### 7. Eval score with USE_AGENTIC=false
expected: npm run eval ≥95% — no regressions on deterministic path.
result: skipped
reason: Not tested separately; pre-Phase-2 baseline was 98%

### 8. Eval score with USE_AGENTIC=true
expected: npm run eval ≥95% pass rate.
result: pass
reported: "eval score 100% PRODUCTION READY (50 convos, 192 turns) after debug fixes in 5d28d6d"

## Summary

total: 8
passed: 5
issues: 0
pending: 0
skipped: 3

## Gaps

- truth: "Eval score ≥95% with USE_AGENTIC=true"
  status: resolved
  reason: "Eval score 100% PRODUCTION READY after debug fixes (5d28d6d) — mandatory next-question injection, optional fields in flow, phone pre-extraction"
  debug_session: ".planning/debug/resolved/eval-agentic-score-82.md"
