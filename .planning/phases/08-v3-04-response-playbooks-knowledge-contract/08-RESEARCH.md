# 08-RESEARCH - V3-04 Response Playbooks (Knowledge Contract)

## Research Scope

Phase 8 asks a product-contract question, not just a prompt-writing question:

- Where is the current response contract already encoded in code?
- Where does intent naming or field policy drift exist?
- What artifact shape would let prompts, runtime behavior, and evals share one source of truth?
- How should Phase 8 sequence work so it improves PM clarity without turning into a full runtime migration?

## Current Architecture Snapshot

### 1) The contract is fragmented today

- `src/lib/prompts-enhanced.ts` is the main contract for `complaint`, `helper_reg`, and `general`.
- `maid_hire` is governed more by state-machine and agentic-flow code than by the shared prompt file.
- `src/app/api/chat/route.ts` adds more behavior inline through intent branching, phone handling, escalation, and fallback text.

Result: "what the bot should collect and say" lives in multiple places.

### 2) Canonical naming still drifts

- Roadmap and state use `maid_registration`.
- `route.ts` detects `maid_registration`, but the non-maid-hire prompt path still branches on `helper_reg`.
- `prompts-enhanced.ts` also exports `helper_reg`, not `maid_registration`.

Result: Phase 8 should treat alias cleanup as part of the contract hardening.

### 3) Required vs optional fields are explicit only for maid_hire

- Phase 8 roadmap text already defines minimum required data for `maid_hire`, `complaint`, and `maid_registration`.
- In code, only `maid_hire` has a strongly structured collection flow today.
- `complaint` and `helper_reg` are still mostly prose-driven prompts rather than typed schemas.

Result: PM cannot point to one artifact and say which fields are mandatory, optional, or repairable across all intents.

### 4) Eval coverage is flow-heavy, contract-light

- `scripts/eval-state-machine.js` is strong for state progression and unhappy-path behavior.
- Existing datasets in `data/` cover state, confusion, orchestration, and unhappy-path behavior.
- There is no dedicated playbook evaluator that checks:
  - entry confirmation wording
  - required field persistence
  - optional field handling
  - completion confirmation contract
  - escalation criteria by intent

Result: the team can ship prompt changes that still "work" without proving they honor the intended playbook contract.

## Recommended Contract Shape

Use a single typed registry for all canonical intents. Each playbook should expose:

- canonical intent id
- legacy aliases (if any)
- required fields
- optional fields
- entry confirmation line / entry policy
- repair policies per field or field class
- completion rule
- completion confirmation template
- escalation rule
- answer-first policy for FAQ/general cases

This should be machine-readable first, then rendered into:
- prompt builders
- PM reference docs
- eval assertions

## Recommended Sequencing

### Plan 01: Create the canonical playbook registry

Do this first because nothing else should be wired until the contract exists in one place.

Focus:
- canonical intent names
- required vs optional fields
- repair / escalation / completion metadata
- contract validation script

### Plan 02: Wire prompts and routing to the contract

Once the contract exists, refactor prompt generation and intent normalization so:
- `prompts-enhanced.ts` becomes a consumer, not the source of truth
- `helper_reg` becomes a compatibility alias, not the main contract id
- maid-hire prompt/state copy references the same contract definitions

### Plan 03: Add PM reference and eval coverage

Only after the contract is live in code should the repo add:
- generated or maintained PM-readable playbook docs
- playbook eval dataset
- playbook-specific evaluator and scripts

This keeps docs and tests aligned to the same registry rather than duplicating intent rules in a second place.

## Recommended File Targets

Foundational files that Phase 8 should likely touch:

- `src/lib/prompts-enhanced.ts`
- `src/app/api/chat/route.ts`
- `src/flows/MaidHiringFlow.ts`
- `src/flows/agenticMaidHire.ts`
- `package.json`
- `scripts/eval-state-machine.js` or a new playbook-specific eval script
- `data/` playbook dataset artifact
- a PM-facing doc under `docs/` or generated from code

Recommended new modules:

- `src/lib/responsePlaybooks.ts`
- `src/lib/responsePlaybookFormatter.ts`
- `scripts/check-response-playbooks.js`
- `scripts/eval-playbooks.js`
- `scripts/generate-playbook-reference.js`

## Pitfalls To Avoid

- Do not leave `maid_hire` on a separate implicit contract while only cleaning up non-hire prompts.
- Do not rename `helper_reg` in one branch but leave DB/prompt/eval assumptions inconsistent.
- Do not create a PM document that must be manually kept in sync with a different code contract.
- Do not define "required" fields without also defining what repair looks like when the user gives partial or invalid data.
- Do not rely only on the existing state-machine eval for Phase 8 exit criteria; it will miss cross-intent response-contract drift.

## Validation Architecture

Phase 8 should be considered complete only if all three layers validate:

### Contract integrity
- every canonical intent has a playbook entry
- required and optional fields are explicitly separated
- canonical aliases resolve deterministically
- roadmap minimum-data requirements are represented in the registry

### Runtime/prompt alignment
- prompt builders consume the registry instead of duplicating intent contract prose
- non-maid-hire routing uses canonical intent ids consistently
- maid-hire completion/repair copy still matches the shared playbook contract

### Eval / PM readiness
- a playbook dataset exists with examples for entry, repair, optional-field acceptance, and completion
- a script can evaluate these cases against `/api/chat`
- PM has one readable playbook reference artifact generated from or directly aligned with the registry

## Confidence

- High: the repo needs a central playbook registry and alias normalization
- High: Phase 8 should be split into contract foundation, integration, and eval/doc coverage
- Medium: exact maid-hire integration surface may need small implementation judgment between `route.ts`, `MaidHiringFlow`, and `agenticMaidHire.ts`

## Sources

Local code reviewed for this phase:
- `CLAUDE.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `src/lib/prompts-enhanced.ts`
- `src/app/api/chat/route.ts`
- `src/core/config.ts`
- `scripts/eval-state-machine.js`
