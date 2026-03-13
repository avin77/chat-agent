---
phase: 14-true-agentic-parity-agentic-orchestration-and-complete-agentic-based-system
plan: 05
subsystem: agentic-runtime-polishing
tags: [fix, polishing, uat-gaps]
dependency_graph:
  requires: [01, 02, 03, 04]
  provides: [natural completion responses, general intent switch support, refined extraction]
  affects: [src/lib/agentic/*, src/lib/responsePlaybooks.ts]
tech_stack:
  patterns: [regex-refinement, optional-field-handling, playbook-naturalization]
key_files:
  modified:
    - src/lib/agentic/playbooks.ts
    - src/lib/agentic/runtime.ts
    - src/lib/agentic/toolRegistry.ts
    - src/lib/responsePlaybooks.ts
    - src/test/test-agentic-runtime.ts
decisions:
  - "Enabled allowSuspend for all intents to support switching from general to service flows mid-conversation."
  - "Refined nextMissingField to respect requiredFields from playbooks, preventing optional fields from blocking completion."
  - "Replaced instructional completion placeholders with natural language responses in responsePlaybooks.ts."
  - "Tightened regex and length constraints for complaint callback and timing extraction to prevent greedy capture."
metrics:
  completed: "2026-03-13"
  tasks_completed: 4
  tasks_total: 4
requirements_completed: [FIX-01, FIX-02, FIX-03]
---

# Phase 14 Plan 05: Shared Runtime Polishing & Fixes Summary

**One-liner:** Polished the shared agentic runtime by fixing gaps in intent switching, completion logic, and extraction precision identified during UAT.

## What Was Built

### Completion Logic Refinement
- Updated `nextMissingField` in `runtime.ts` to only consider fields marked as required in the playbook.
- This ensures that optional fields (like `incident_timing` in complaints) do not block flow completion or escalation.

### Natural Language Responses
- Updated `src/lib/responsePlaybooks.ts` to include friendly, final responses for all intents.
- Users now receive natural confirmations instead of raw playbook instructions upon completing a flow.

### Extraction Precision
- Refined `deriveCallbackPreference` and `deriveIncidentTiming` in `toolRegistry.ts`.
- Introduced stricter keyword matching and message length thresholds to ensure specific data is captured rather than the entire user message.

### Multi-Intent Flexibility
- Enabled `allowSuspend` for the `general` intent in `playbooks.ts`.
- This allows the system to switch to a specific service flow (e.g., `maid_hire`) even if the conversation started with a general inquiry or FAQ.
