---
phase: 02-agentic-tool-calling-flow
plan: "01"
subsystem: api
tags: [ai-sdk, gemini, tool-calling, agentic, supabase, zod, typescript]

# Dependency graph
requires:
  - phase: 01-llm-extraction-integration
    provides: isValidPhone(), ExtractionMeta type, CollectedData type from BaseFlow.ts
  - phase: 03-dashboard-cost-tracking
    provides: guardrails.ts applyStrictGuardrails(), llm-logger.ts logLLMInteraction() patterns
provides:
  - handleMaidHireAgentic() — drop-in replacement for handleMaidHireStateMachine() in route.ts
  - agenticTools — 8 tool definitions (7 save_* + 1 escalate) using ai@6 tool() helper
  - saveAgenticSession() — writes agentic_mode=true to conversation_sessions on every turn
affects: [02-02-route-integration, route.ts, conversation_sessions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ai@6 tool() with inputSchema (zod) + execute() pattern for field validation"
    - "generateText() with toolChoice='auto' for single-step agentic turn"
    - "__consecutive_failures stored in CollectedData (mirrors __confusion in deterministic)"
    - "__tool_calls stored as JSON string in CollectedData for loop detection"
    - "__loop_detected flag persists across turns to trigger deterministic fallback"
    - "generateText() NOT wrapped in try/catch — Gemini errors propagate to route.ts"

key-files:
  created:
    - src/flows/agenticMaidHire.ts
  modified: []

key-decisions:
  - "Inline validator copies (validateLocation, validateServiceType, validateSchedule) — not imported from MaidHiringFlow.ts to avoid coupling; they are short pure functions"
  - "toolChoice='auto' not 'required' — lets LLM respond with text for FAQs without forcing tool call"
  - "result.toolCalls[0].input (not .args) — ai@6 breaking change; execute() output read from toolResults[0].output"
  - "Loop detection counts ALL tool calls per tool name (success + failed) — 3+ total triggers fallback"
  - "force-escalate shouldEscalate=true only if phone is present (partial lead); false if no phone"
  - "NEED_PHONE / NEED_LOCATION pattern for current_state in agentic mode (vs FlowState enum in deterministic)"

patterns-established:
  - "Tool execute() always returns {success, field?, value?, error?} — uniform output shape"
  - "displayText derivation priority: LLM text > tool error > derived next-question string"
  - "saveAgenticSession() always writes agentic_mode=true — required for FLOW-03 compliance"

requirements-completed: [FLOW-01, FLOW-04, FLOW-05, FLOW-06]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 2 Plan 1: Agentic Maid Hire Handler Summary

**LLM tool-calling handler for maid_hire with 8 validated tools, force-escalate, loop detection, and guardrails — drop-in compatible with handleMaidHireStateMachine()**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T13:19:05Z
- **Completed:** 2026-02-28T13:21:38Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- Created `src/flows/agenticMaidHire.ts` with `handleMaidHireAgentic()` and `agenticTools` exports
- All 8 tools defined with `tool()` + `inputSchema` (zod) + typed `execute()` functions
- Return type exactly matches `handleMaidHireStateMachine` — route.ts can swap with no changes to logging/escalation logic
- FLOW-05: Force-escalate fires after 3 consecutive validation failures; shows phone or no-phone message
- FLOW-06: Loop detection via `__tool_calls` JSON in collectedData; `__loop_detected` flag persists across turns
- FLOW-04: `applyStrictGuardrails()` applied to all display text before returning
- Gemini API errors propagate uncaught — route.ts single-turn fallback pattern preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agenticMaidHire.ts — tools + handler** - `deecb40` (feat)

## Files Created/Modified

- `src/flows/agenticMaidHire.ts` — Complete agentic handler: 8 tool definitions, handleMaidHireAgentic(), saveAgenticSession(), helper functions (isComplete, detectToolLoop, updateToolCallCount, buildAgenticSystemPrompt, shouldForceEscalateAgentic)

## Decisions Made

- **Inline validators**: `validateLocation`, `validateServiceType`, `validateSchedule` re-declared in agenticMaidHire.ts (Option B from RESEARCH.md) — avoids coupling to MaidHiringFlow.ts internals with no behavior change
- **toolChoice='auto'**: Lets LLM respond with text for FAQ answers without forcing tool call on every turn (RESEARCH.md Pitfall 3)
- **ai@6 API**: Used `result.toolCalls[0].input` (not `.args`) and `result.toolResults[0].output` (not return value) per RESEARCH.md Pitfall 1
- **Loop detection threshold**: 3+ calls of ANY tool triggers fallback (aligns with spec; acceptable that 3 invalid phone attempts trigger it — FLOW-05 force-escalate fires first anyway)
- **NEED_PHONE state naming**: Agentic handler uses `NEED_PHONE`, `NEED_LOCATION`, etc. instead of FlowState enum values — keeps Supabase `current_state` readable without importing deterministic enum

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compilation passed cleanly on first attempt.

## User Setup Required

None — no external service configuration required beyond existing Supabase setup.
The `agentic_mode` column migration (supabase-migration-phase2.sql) is part of Plan 02 scope.

## Next Phase Readiness

- `handleMaidHireAgentic` is ready to be imported by route.ts
- Plan 02 (feature flag routing) adds `USE_AGENTIC=true` routing in route.ts and the Supabase migration
- All FLOW-01, FLOW-04, FLOW-05, FLOW-06 requirements satisfied in this file
- FLOW-02 (feature flag) and FLOW-03 (session schema migration) are Plan 02 scope

## Self-Check: PASSED

- `src/flows/agenticMaidHire.ts` — FOUND
- Commit `deecb40` — FOUND
- `.planning/phases/02-agentic-tool-calling-flow/02-01-SUMMARY.md` — FOUND
- TypeScript compilation: PASSED (npx tsc --noEmit with zero errors)

---
*Phase: 02-agentic-tool-calling-flow*
*Completed: 2026-02-28*
