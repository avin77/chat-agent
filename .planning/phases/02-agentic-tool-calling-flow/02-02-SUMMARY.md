---
phase: 02-agentic-tool-calling-flow
plan: "02"
subsystem: routing
tags: [feature-flag, agentic, supabase, migration, route]
dependency_graph:
  requires: [02-01]
  provides: [USE_AGENTIC routing, supabase agentic_mode column, single-turn deterministic fallback]
  affects: [src/app/api/chat/route.ts, supabase-migration-phase2.sql]
tech_stack:
  added: []
  patterns: [feature-flag routing, helper function deduplication, single-turn fallback on API error]
key_files:
  created:
    - supabase-migration-phase2.sql
  modified:
    - src/app/api/chat/route.ts
decisions:
  - USE_AGENTIC=true routes maid_hire to handleMaidHireAgentic(); false/unset keeps deterministic path 100% intact
  - handleMaidHireSuccess() helper deduplicates logging/escalation/response code instead of copy-pasting the large block into catch
  - loopDetected read from dbSession.collected_data.__loop_detected === 'true' forces deterministic for that turn
  - Outer catch on useAgenticThisTurn=true calls handleMaidHireStateMachine() — not a text fallback — preserving full state machine logic
  - collected_via uses collectedVia parameter ('agentic' | 'state_machine') passed into shared helper
metrics:
  duration_seconds: 103
  completed_date: "2026-03-01"
  tasks_completed: 2
  files_changed: 2
requirements_completed: [FLOW-02, FLOW-03]
---

# Phase 02 Plan 02: USE_AGENTIC Routing + Supabase Migration Summary

Wire the agentic handler into route.ts behind the USE_AGENTIC feature flag, with supabase-migration-phase2.sql for the agentic_mode column.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create supabase-migration-phase2.sql | 7ae043e | supabase-migration-phase2.sql |
| 2 | Wire USE_AGENTIC routing into route.ts | 64c7cad | src/app/api/chat/route.ts |

## What Was Built

### Task 1: supabase-migration-phase2.sql

Created `supabase-migration-phase2.sql` in the project root:

```sql
ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS agentic_mode BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_agentic_mode
  ON conversation_sessions(agentic_mode, created_at DESC);
```

Safe to re-run (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). Human applies it in the Supabase SQL Editor (same process as Phase 3 migration). Plan 01's `saveAgenticSession()` already writes `agentic_mode: true` — it will work once this column exists.

### Task 2: route.ts — USE_AGENTIC Feature Flag Routing

**Import added (line 20):**
```typescript
import { handleMaidHireAgentic } from '@/flows/agenticMaidHire';
```

**Routing logic added to maid_hire block:**
```typescript
const useAgentic = process.env.USE_AGENTIC === 'true';
const loopDetected = dbSession?.collected_data?.__loop_detected === 'true';
const useAgenticThisTurn = useAgentic && !loopDetected;
```

**Handler selection ternary:**
```typescript
useAgenticThisTurn
    ? await handleMaidHireAgentic(conversationId, latestMessage, coreMessages, dbSession)
    : await handleMaidHireStateMachine(conversationId, latestMessage, coreMessages, dbSession);
```

**Agentic-specific leads insert:**
```typescript
collected_via: collectedVia,  // 'agentic' | 'state_machine'
```

**Single-turn deterministic fallback on Gemini API error:**
```typescript
} catch (agenticError: any) {
    if (useAgenticThisTurn) {
        console.warn('[Agentic Error] Falling back to deterministic for this turn:', agenticError.message);
        const { ... } = await handleMaidHireStateMachine(...);  // NOT a text fallback
        return await handleMaidHireSuccess(..., 'state_machine');
    }
}
```

**Implementation note:** The `handleMaidHireSuccess()` helper function was introduced to avoid copy-pasting the 100+ line logging/escalation/response block into the catch clause. This is a structural improvement (deviation Rule 2 — missing code deduplication) that keeps both code paths DRY while satisfying all plan constraints exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Deduplication] Introduced handleMaidHireSuccess() helper**
- **Found during:** Task 2
- **Issue:** The plan spec showed the catch block should contain "Copy the full logLLMInteraction + escalation + response code here verbatim". Duplicating ~100 lines creates maintenance risk and a violation of DRY principle.
- **Fix:** Extracted a `handleMaidHireSuccess()` async helper function inside the `if (intent === 'maid_hire')` block. Both the try and catch paths call it with `collectedVia: 'agentic' | 'state_machine'`. All plan constraints are satisfied (correct routing, correct fallback, correct collected_via).
- **Files modified:** src/app/api/chat/route.ts
- **Commit:** 64c7cad

## Verification

```
npx tsc --noEmit     → PASSED (no errors)
npm run build        → PASSED (✓ Compiled successfully)

grep "USE_AGENTIC"                  → line 534: const useAgentic = process.env.USE_AGENTIC === 'true'
grep "handleMaidHireAgentic"        → line 20 (import) + line 668 (call)
grep "collected_via"                → line 598: collected_via: collectedVia
grep "__loop_detected"              → line 536: loopDetected read from dbSession
grep "handleMaidHireStateMachine"   → line 685: deterministic fallback in catch
```

## Self-Check: PASSED

- supabase-migration-phase2.sql: FOUND
- src/app/api/chat/route.ts: FOUND (modified)
- Commit 7ae043e: FOUND (supabase-migration-phase2.sql)
- Commit 64c7cad: FOUND (route.ts USE_AGENTIC routing)
