# Phase 08: V3-04 Response Playbooks (Knowledge Contract) - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Source:** Roadmap and state synthesis (no separate `$gsd-discuss-phase 8` session captured)

<domain>
## Phase Boundary

Phase 8 is the contract layer for how EzyBot should respond and what it must collect for each canonical intent.

This phase should:
- define one explicit playbook per canonical intent: `maid_hire`, `complaint`, `maid_registration`, and `general`
- separate required fields from optional fields so PM, engineering, prompts, and evals all use the same contract
- standardize entry confirmation, repair behavior, completion confirmation, and escalation criteria
- replace ad hoc prompt wording as the source of truth with a reusable playbook contract artifact

This phase should not become a new runtime rewrite. It is a product contract and prompt/eval alignment phase.

</domain>

<decisions>
## Locked Decisions

### Product behavior
- `maid_hire` minimum required data stays `phone`, `area`, `service_type`, and `schedule`.
- `complaint` minimum required data stays `contact`, `issue summary`, `severity`, `callback preference`, and `incident timing` when available.
- `maid_registration` minimum required data stays `contact`, `role/service offered`, `experience`, `availability window`, and `preferred areas`.
- Every intent playbook must define:
  - entry confirmation line
  - required fields
  - optional fields
  - failure / repair responses
  - completion confirmation format
  - escalation criteria

### Architecture
- Prompt templates must reference the playbook contract instead of keeping intent rules only as prose in `src/lib/prompts-enhanced.ts`.
- Canonical runtime naming should stay `maid_registration`; legacy `helper_reg` handling is compatibility behavior, not the contract name.
- Eval coverage should be able to verify playbook behavior explicitly, not only generic state-machine behavior.

### PM / inspection needs
- PM needs one readable artifact that explains what "good completion" means for each intent.
- Engineering needs a machine-readable source of truth that prompt builders and eval scripts can share.

### Claude's discretion
- Exact file/module structure for the playbook registry.
- Whether the PM-facing reference is generated or handwritten, as long as it stays aligned with the contract artifact.
- Whether contract verification is implemented as a standalone script, eval runner, or both.

</decisions>

<specifics>
## Current Codebase Signals

- `src/lib/prompts-enhanced.ts` contains large hand-written prompt blocks for `complaint`, `maid_hire`, `helper_reg`, and `general`.
- `src/app/api/chat/route.ts` already detects `maid_registration` but still branches on `helper_reg` in prompt and DB logic.
- `maid_hire` behavior is split across `route.ts`, `MaidHiringFlow`, and `agenticMaidHire.ts`, so its contract is partly implicit.
- Existing eval tooling (`scripts/eval-state-machine.js`) validates flow behavior, but there is no dedicated playbook-contract dataset or runner yet.

## Desired Outcomes

- One canonical playbook registry that both prompts and evals can import.
- Consistent naming between roadmap, state, route logic, and prompt builders.
- A PM-readable response playbook document that can be reviewed without reading code.
- A dedicated eval surface that checks contract adherence for entry, repair, optional-field handling, and completion messaging.

</specifics>

<deferred>
## Deferred / Out Of Scope

- Full shared agentic runtime migration (covered later by Phase 14).
- Dashboard metric redesign work (already packaged in Phase 9).
- New intents beyond the current canonical set.
- Generalized autonomous behavior outside EzyBot's current service scope.

</deferred>

---

*Phase: 08-v3-04-response-playbooks-knowledge-contract*
*Context gathered: 2026-03-11 via roadmap/state synthesis*
