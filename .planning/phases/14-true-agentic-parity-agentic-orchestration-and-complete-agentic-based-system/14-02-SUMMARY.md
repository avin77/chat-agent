---
phase: 14-true-agentic-parity-agentic-orchestration-and-complete-agentic-based-system
plan: 02
subsystem: routing-shadow
tags: [migration, shadow, parity]
dependency_graph:
  requires: [01]
  provides: [maid_hire shared runtime parity, shadow simulation]
  affects: [src/flows/agenticMaidHire.ts, src/lib/shadowHandler.ts]
tech_stack:
  patterns: [adapter-pattern, shadow-simulation, dead-code-cleanup]
key_files:
  modified:
    - src/flows/agenticMaidHire.ts
    - src/lib/shadowHandler.ts
decisions:
  - "Refactored handleMaidHireAgentic to be a slim adapter for runAgenticTurn()"
  - "Shadow mode now uses the exact same runtime code as production (faithful simulation)"
  - "Removed 200+ lines of redundant state-machine code from agenticMaidHire.ts"
metrics:
  completed: "2026-03-12"
  tasks_completed: 4
  tasks_total: 4
requirements_completed: [FLOW-02, FLOW-03, SHADOW-01, SHADOW-02]
---

# Phase 14 Plan 02: MaidHire Parity & Shadow Foundation Summary

**One-liner:** Migrated the `maid_hire` flow to the shared runtime and established a faithful shadow simulation path for observability.

## What Was Built

### MaidHire Adapter (`src/flows/agenticMaidHire.ts`)
- Replaced the monolithic state-machine implementation with a call to `runAgenticTurn()`.
- Maintained the legacy interface for `route.ts` while delegating all logic to the shared runtime.
- Resulted in significant code reduction and improved maintainability.

### Faithful Shadow Simulation (`src/lib/shadowHandler.ts`)
- Updated `runShadowSimulation()` to use `runAgenticTurn({ runtimeMode: 'shadow_simulate' })`.
- This ensures that shadow logs reflect exactly how the system would behave in production mode.
- Agreement metrics are now more reliable due to identical code paths.
