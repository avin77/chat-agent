# 11-RESEARCH - V3-07 Flywheel for Synonyms and Recovery

## Research Scope

Phase 11 needs a repeatable loop that turns repeated synonym and recovery failures into shipped fixes.

Primary unknowns researched:
- what mining and eval tooling already exists
- where service-type synonyms and repair guidance currently live
- how to align the new flywheel with the older pending `FLY-*` requirements
- how to lock fixes in with regression coverage so `c56`-style failures do not return

## Repo Findings

- `package.json` already has runnable eval entrypoints for:
  - `eval`
  - `eval:state`
  - `eval:unhappy`
  - `eval:playbooks`
- `scripts/` already contains useful adjacent tooling:
  - `eval-state-machine.js`
  - `show-eval-failures.js`
  - `add-unhappy-evals.js`
  - `check-response-playbooks.js`
- the flywheel mining scripts called out in `.planning/REQUIREMENTS.md` do not exist yet:
  - `scripts/mine-missed-extractions.js`
  - `scripts/mine-golden-from-prod.js`
  - `scripts/analyze-guardrail-mods.js`
- service-type and synonym logic is currently scattered:
  - extractor heuristics in `src/extractors/dataExtractor.ts`
  - prompt nudges in `src/lib/prompts-enhanced.ts`
  - response expectations in `src/lib/responsePlaybooks.ts`
  - runtime intent normalization in `src/lib/agentic/runtime.ts`
- roadmap evidence shows a persistent unhappy-path class:
  - `c56` / `synonym_hinglish_service`

## Standard Stack

Use this stack:
- mining scripts for production and eval misses
- one normalized review artifact format in `data/`
- one reusable synonym / recovery knowledge source in code
- unhappy and state datasets as the regression lock
- PM-readable runbook documenting the loop

## Architecture Patterns

### 1) Normalize Misses Before Fixing Them

Do not patch one failed phrase at a time straight from an eval report.

Normalize misses into an artifact that captures:
- source (`eval`, `prod`, `guardrail`)
- conversation id or hashed session id
- turn index
- category
- user phrase
- expected canonical field or repair behavior
- candidate fix bucket (`synonym`, `playbook`, `prompt`, `routing`)

Reason: repeated failure classes become visible only after normalization.

### 2) One Knowledge Source for Synonyms

Current synonym handling is partially implicit in extractor regex and partially implicit in prompts.

Create one explicit synonym / vocabulary source for service-type and recovery phrases, then fan it out to:
- extractor matching
- prompt hints
- playbook examples

This reduces drift and makes future additions reviewable.

### 3) PII-Safe Mining

Production-derived artifacts should hash or redact user-identifying fields before writing to `data/`.

Mining scripts should support:
- dry-run / help mode for local verification
- clear env checks for Supabase credentials
- deterministic output naming

### 4) Regression Lock After Every Accepted Fix

A flywheel is incomplete if fixes are only manual.

Every resolved miss class should create or update a regression case in:
- `unhappy-golden-dataset.json`
- `state-golden-dataset.json`
- or a dedicated focused dataset if the failure class deserves its own surface

## Recommended Implementation

### Recommended files

- `scripts/mine-missed-extractions.js`
- `scripts/mine-golden-from-prod.js`
- `scripts/analyze-guardrail-mods.js`
- `src/lib/serviceVocabulary.ts` or similar single synonym source
- `src/extractors/dataExtractor.ts`
- `src/lib/prompts-enhanced.ts`
- `src/lib/responsePlaybooks.ts`
- `data/unhappy-golden-dataset.json`
- `docs/synonym-recovery-flywheel.md`

## Alignment With Existing Requirements

Phase 11 should deliberately absorb the still-pending `FLY-*` requirements:
- `FLY-01`
- `FLY-02`
- `FLY-03`
- `FLY-04`

Reason: those requirements already describe the mining primitives needed for this v3 flywheel.

## Don't Hand-Roll

- Do not keep adding synonym phrases only inside prompts.
- Do not write production-mined raw transcripts with unhashed phone numbers or names.
- Do not treat `c56` as a one-off fix; the loop must generalize to future categories.
- Do not update datasets without recording what miss class they now protect.

## Validation Plan

- verify mining scripts can run in `--help` or `--dry-run` mode without production access
- verify mined artifacts use a consistent schema
- verify one accepted synonym update improves `c56`-class behavior
- verify regression datasets fail before the fix and pass after it

## Confidence

- High: repo already has enough eval and prompt surfaces to support a repeatable loop
- High: aligning with pending `FLY-*` requirements reduces duplicated future work
- Medium: production mining details depend on available Supabase credentials during execution

## Sources

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `package.json`
- `scripts/`
- `src/extractors/dataExtractor.ts`
- `src/lib/prompts-enhanced.ts`
- `src/lib/responsePlaybooks.ts`
- `data/unhappy-golden-dataset.json`
