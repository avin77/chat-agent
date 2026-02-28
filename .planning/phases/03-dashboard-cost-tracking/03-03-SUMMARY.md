---
phase: 03-dashboard-cost-tracking
plan: "03"
subsystem: intent-classifier-shadow-handler
tags: [intent-classification, shadow-mode, confusion-tracking, agentic-readiness]
dependency_graph:
  requires: [03-01, 03-02-partial]
  provides: [intentClassifier, shadowHandler, confusionTracking]
  affects: [src/app/api/chat/route.ts, src/flows/BaseFlow.ts]
tech_stack:
  added: []
  patterns: [fire-and-forget, confusion-counter, intent-classification]
key_files:
  created:
    - src/extractors/intentClassifier.ts
    - src/lib/shadowHandler.ts
  modified:
    - src/flows/BaseFlow.ts
    - src/app/api/chat/route.ts
decisions:
  - "__confusion stored in CollectedData via existing index signature — no DB migration, no MaidHiringFlow.ts change needed"
  - "Shadow handler fires before return (assigned to variable) with .catch() — fire-and-forget pattern"
  - "Classifier skips START and COMPLETE states — only runs mid-flow (ASK_PHONE through ASK_EXPERIENCE)"
  - "Pre-existing dashboard/page.tsx ProductHealth TypeScript error is from partial plan 03-02 work — out of scope for 03-03"
metrics:
  duration_minutes: 3
  completed_date: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 3 Plan 03: Intent Classifier + Shadow Handler Summary

**One-liner:** LLM-powered mid-flow intent classification with confusion counter and async agentic shadow comparison logging to shadow_logs.

## What Was Built

### src/extractors/intentClassifier.ts (new)
Lightweight LLM classifier that categorizes user messages mid-flow into 7 categories: `expected_slot_answer`, `new_intent`, `meta_question`, `clarification_request`, `off_topic`, `abusive`, `unknown`. Uses `gemma-3-27b-it` with a narrow system prompt. NEVER throws — any error defaults to `unknown`. Validates against `VALID_CATEGORIES` array before returning.

### src/lib/shadowHandler.ts (new)
Async shadow mode handler that runs AFTER production response is returned (fire-and-forget). Calls `gemma-3-27b-it` to propose what an agentic system would do (next_state + slots), compares vs production state machine decision, and writes agreement data to `shadow_logs` Supabase table. All errors are swallowed — never affects production path. Only active when `USE_AGENTIC` env var is not `'true'`.

### src/flows/BaseFlow.ts (modified)
Added doc comment above `CollectedData` interface explaining the `__confusion` reserved key convention. No structural changes — the existing `[key: string]: string | undefined` index signature already permits `__confusion`. MaidHiringFlow.ts intentionally NOT modified.

### src/app/api/chat/route.ts (modified)
- Added imports for `classifyMessage` and `runShadowHandler`
- Added `newState: string` to `handleMaidHireStateMachine` return type and all return paths
- Integrated classifier at step 3.5 (between slot extraction and processMessage), skipping START/COMPLETE states
- Added confusion counter tracking via `collected_data.__confusion` string key
- After 2 consecutive irrelevant messages, overrides `llmInstruction` to offer restart or support
- Fires shadow handler with `.catch()` before returning response in maid_hire POST branch
- Updated destructuring to include `newState`

## Deviations from Plan

None — plan executed exactly as written.

The `ProductHealth` TypeScript error in `src/app/dashboard/page.tsx` is a pre-existing issue from partial plan 03-02 work that was in the working copy but not committed. It is out of scope for plan 03-03 and will be resolved when plan 03-02 is properly executed.

## Key Decisions Made

1. **`__confusion` via index signature**: Stored `__confusion` in `CollectedData` using the existing `[key: string]: string | undefined` index signature. No DB migration, no MaidHiringFlow.ts change. This is the deliberate discretion decision documented in the plan objective.

2. **Fire-and-forget pattern**: Shadow handler is assigned to variable before `runShadowHandler(...).catch()` is called, then the variable is returned. This ensures shadow fires even though we can't `await` after `return`.

3. **Classifier rate limit tracking**: Each classifier call invokes `geminiRateLimiter.recordRequest()` — accurate tracking of all Gemini API calls per turn.

4. **Confusion reset on offer**: When `triggerConfusionResponse` fires at 2+ irrelevant messages, confusion count is reset to `'0'` in both `session.collectedData` and `result.collectedData` to prevent repeated offers.

## Self-Check: PASSED

- src/extractors/intentClassifier.ts: FOUND
- src/lib/shadowHandler.ts: FOUND
- Task 1 commit (7dd3435): FOUND
- Task 2 commit (087dbeb): FOUND
- TypeScript (route.ts, BaseFlow.ts, shadowHandler.ts, intentClassifier.ts): CLEAN
- Pre-existing error (dashboard/page.tsx ProductHealth): OUT OF SCOPE — logged as deferred
