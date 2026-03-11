# Phase 14 Research: True Agentic Parity, Agentic Orchestration, and Complete Agentic-Based System

**Date:** 2026-03-10
**Question:** What must change in the current architecture to make agentic behavior live-quality, multi-intent-safe, and measurable?

## Current Architecture Snapshot

### 1. Production is hybrid, not truly shared-agentic

- `src/app/api/chat/route.ts` uses intent detection plus special-case routing.
- `maid_hire` can run deterministic state machine or constrained agentic logic behind `USE_AGENTIC=true`.
- `complaint`, `maid_registration` / `helper_reg`, and `general` still use prompt-first behavior rather than a shared structured runtime.

### 2. Live agentic and shadow do not share execution logic

- `src/flows/agenticMaidHire.ts` is a constrained tool-using runtime with:
  - pre-extraction
  - validators
  - loop detection
  - session persistence
  - deterministic fast paths
  - fallback to safe prompts
- `src/lib/shadowHandler.ts` is only a proposal prompt:
  - no pre-extraction
  - no shared validators
  - no tool execution
  - no side-intent handling
  - no session write simulation

This means current shadow agreement is not a real parity signal.

### 3. Slot policy is not centralized

- `BaseFlow.ts` supports multi-slot capture and optional field acceptance.
- `agenticMaidHire.ts` separately contains pre-extraction, per-field validation, skip rules, and next-field logic.
- `dataExtractor.ts` owns a third layer of slot behavior.

Result: capture, rejection, and repair rules are duplicated and can drift.

### 4. Intent taxonomy still drifts in live code

- roadmap intent contract uses `maid_registration`
- prompt/runtime branches still reference `helper_reg`

This creates implementation ambiguity and weakens multi-intent correctness.

## Product / Technical Gaps

### Out-of-order slot capture gap

The system is strongest when multiple slots are provided together, but weaker when a single valid non-current slot arrives mid-flow. That means memory is partly message-shape-dependent, which is a product smell.

### Side-intent parity gap

The repo has `intent_stack` support in session state, but live behavior is still uneven because only part of the system is structured enough to preserve slot-level continuity.

### Validation gap

Optional fields are sometimes accepted too loosely. This makes the bot feel "agentic" but also allows low-quality state writes.

### PM inspection gap

PM can now see shadow rows and shadow details, but there is still no single canonical reference tying:
- intent contract
- slot rules
- escalation rules
- runtime behavior

to one editable source.

## Recommended Architecture

### A. Shared agentic runtime with execution modes

Create one shared runtime that supports:
- `mode: live_commit`
- `mode: shadow_simulate`

Both modes must use the same:
- intent playbooks
- slot definitions
- validators
- tool registry
- next-step logic
- repair policy

The only difference should be whether writes commit to live session state or remain simulated.

### B. Intent playbooks as runtime input

Each canonical intent should define:
- intent id
- supported slots
- required vs optional slots
- validation policy
- escalation policy
- answer-first rules for FAQ-like cases
- completion criteria
- suspend / resume behavior

This lets product decisions drive runtime behavior cleanly.

### C. Central slot policy

Every extracted candidate slot should go through the same decision pipeline:
1. detect candidate slot(s)
2. map to target intent
3. validate
4. reject / repair if invalid
5. commit if valid
6. derive next question

This is the core change needed for "capture extra pointers anywhere, but do not accept wrong answers."

### D. Explicit side-intent snapshots

Suspending an intent should preserve:
- current state
- collected slots
- slot attempt counters
- repair context if needed

Resuming should restore the exact intent snapshot, not just the raw collected slots.

### E. Decision log for parity and PM inspection

For each turn, log:
- active intent
- suspended intents
- extracted candidates
- accepted slots
- rejected slots and reason
- next state
- repair action used
- mode (`production`, `shadow`)

This makes parity analysis and dashboard inspection materially useful.

## Recommended Sequencing

1. Normalize intent names and define the shared runtime contract.
2. Move `maid_hire` onto the shared runtime first.
3. Replace proposal-only shadow with shared runtime simulation.
4. Migrate `complaint` and `maid_registration` onto the same runtime.
5. Add multi-intent turn routing and suspended-intent restoration on top of the shared runtime.
6. Add PM reference docs and targeted evals before promoting live agentic by default.

## Risks

- Over-rotating into "fully autonomous" behavior would weaken reliability and make repair behavior harder to control.
- Migrating all intents at once without a shared contract will reproduce current drift in a new layer.
- If shadow remains prompt-only, PM may trust a parity signal that does not reflect real runtime readiness.

## Validation Architecture

Phase 14 should not be promoted without targeted evidence in these groups:

### Runtime correctness
- out-of-order single-slot capture
- multi-slot same-turn capture
- invalid answer rejection
- side-intent suspend and resume
- contradictory answer repair

### Intent fidelity
- canonical intent normalization (`maid_registration`, not `helper_reg`)
- complaint capture without destroying suspended hire flow
- FAQ answer-first behavior inside active flows

### Shadow parity
- shadow uses same runtime in simulate mode
- parity computed from the same decision contract, not free-form JSON guesses
- PM can inspect production vs shadow per turn

### PM readiness
- one reference doc for every live intent
- rollout checklist before enabling agentic live by default

## Recommendation

Plan Phase 14 as a four-step future phase:
- contract and runtime foundation
- maid_hire parity plus faithful shadow
- multi-intent rollout across complaint and maid_registration
- PM reference docs plus readiness verification

This keeps the phase ambitious, but still bounded and operationally defensible.
