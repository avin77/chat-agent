# Phase 14: True Agentic Parity, Agentic Orchestration, and Complete Agentic-Based System - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning
**Source:** User direction captured during planning session

<domain>
## Phase Boundary

Phase 14 is not "build an open-ended autonomous agent." It is a bounded, production-safe agentic runtime for EzyBot's supported intents.

This phase should:
- move the live system from hybrid state-machine plus prompt branches to a shared constrained agentic orchestration layer
- make shadow mode a faithful simulation of the same runtime instead of a weaker proposal-only prompt
- preserve existing safety characteristics: validation, fallbacks, lead capture, and PM observability
- support multi-intent sessions where the user can interrupt the current flow, resolve a side intent, and resume without losing prior state

The target intents are:
- `maid_hire`
- `complaint`
- `maid_registration`
- `general`

The runtime must treat these as canonical names everywhere.

</domain>

<decisions>
## Locked Decisions

### Product behavior
- Any valid slot a user provides should be captured even if it was not the currently asked field, as long as the target intent is unambiguous.
- If the user provides multiple valid details in one message, the runtime should persist all valid details and ask only the next missing field.
- If the user switches into a side intent mid-flow, the original flow must be suspended and resumed without re-asking already known fields.
- Invalid, ambiguous, or contradictory answers should not be committed silently; the bot should respond with a repair prompt instead.
- Better repair behavior is part of the goal: do not just reject; explain what is missing or wrong and ask the precise next question.

### Architecture
- "Complete agentic-based system" means constrained tool-using orchestration with shared validators, memory, and decision logs, not arbitrary autonomous planning.
- Shadow mode must call the same shared runtime in simulate mode so parity measurements are meaningful.
- The existing deterministic path remains the safety fallback until the new agentic runtime proves parity.

### PM / inspection needs
- PM must be able to inspect production and shadow decisions for the same conversation.
- PM needs one reference document describing per-intent contract: canonical name, required fields, optional fields, completion rule, escalation rule, and actual live behavior.

</decisions>

<specifics>
## Current Pain Points This Phase Must Address

- Shadow mode is weaker than production because it only asks the model for a one-shot proposal and does not use the live execution path.
- Single valid out-of-order slots are not reliably retained in the live flow, even though multi-slot capture works in many cases.
- `maid_registration` and `helper_reg` naming drift still exists in the live route and prompt paths.
- `complaint` and `maid_registration` are still largely prompt-driven instead of sharing the structured runtime used by `maid_hire`.
- The extractor can falsely save names from phrases like `I am in Koramangala`.
- PM wants agentic behavior that updates the right intent when users mix questions, corrections, and extra details in one turn.

## Desired User Behaviors

- `My number is 9887979879 and I am in Koramangala` should store both fields and move on.
- `Koramangala` while the bot is asking for phone should still be remembered for the current hire intent.
- `Do you have 24-hour maids?` asked mid-flow should answer the question, retain the flow, and continue from the right next field.
- `I also want to complain that your maid was late` mid-flow should open complaint handling without destroying the suspended hire flow.
- `No` or other wrong answers should not be mis-filed into the wrong optional slot without validation.

</specifics>

<deferred>
## Deferred / Explicitly Out Of Scope

- Arbitrary tool discovery or open-ended autonomous planning
- Unknown zero-shot intents with no contract
- Browsing, external search, or generalized assistant behavior outside EzyBot domains
- Replacing PM-governed playbook decisions with model-only discretion

</deferred>

---

*Phase: 14-true-agentic-parity-agentic-orchestration-and-complete-agentic-based-system*
*Context gathered: 2026-03-10*
