# 10-RESEARCH - V3-06 Eval Governance (3 Tracks)

## Research Scope

Phase 10 needs a release-governance package that turns eval artifacts into a ship / block decision.

Primary unknowns researched:
- what eval surfaces already exist in the repo
- where thresholds are currently hardcoded versus reusable
- how to encode must-fix slices such as `c15`, `c28`, and `c56`
- how PM and engineering should consume the same decision logic without drift

## Repo Findings

- `package.json` already exposes three relevant eval entrypoints:
  - `npm run eval` for the normal regression suite
  - `npm run eval:state` for core flow correctness
  - `npm run eval:unhappy` for unhappy-path robustness
- `data/` already contains versioned `eval-state-*.json` artifacts and unhappy datasets; the dashboard already reads latest eval files.
- `src/app/dashboard/page.tsx` currently shows pre-production gates, but the thresholds are presentation-first and not yet a canonical release policy.
- `src/app/dashboard/actions.ts` already has file-scanning patterns for latest eval artifacts, so governance should reuse those patterns rather than invent a second reader.
- The roadmap already identifies concentrated blocker slices:
  - `c15 t2` and `c28 t5` from the state track
  - `c56` (`synonym_hinglish_service`) from the unhappy track

## Standard Stack

Use this stack:
- `src/lib/evalGovernance.ts` as the single source of truth for track policy
- `scripts/check-eval-governance.js` as the local release checker
- dashboard server actions as thin wrappers over the shared governance helper
- versioned eval JSON artifacts in `data/` as the input surface
- PM-facing docs generated or written against the same governance contract

## Architecture Patterns

### 1) Governance Contract in Code

Do not keep track floors and blocker slices only in markdown or JSX.

Create a typed governance contract with:
- track id
- required / optional status
- minimum score
- blocker conversation ids or slice categories
- interpretation for missing artifacts

Reason: CLI checks, dashboard panels, and future CI hooks must all use the same policy.

### 2) Track-First Release Decision

Global averages are not sufficient. The release verdict should be:
- `pass`
- `warn`
- `block`

Computed from per-track results, not a blended score.

Examples:
- `eval:state` below floor blocks release
- `eval:unhappy` regression blocks release even if `eval:state` is perfect
- missing required track artifact blocks release
- blocker slice still failing blocks release even when the track score is above floor

### 3) Explicit Must-Fix Slices

Known failures should be encoded as data, not remembered socially.

Initial blocker set should include:
- `state`: `c15`, `c28`
- `unhappy`: `c56`

The helper should support both direct conversation ids and category-level slices so PM can express rules like `synonym_hinglish_service must be clean`.

### 4) Shared Decision Object

Return one structured object for all consumers:
- latest file used per track
- score
- threshold
- blocker status
- final release verdict
- human-readable reasons

This keeps the dashboard and local scripts aligned.

## Recommended Implementation

### Recommended files

- `src/lib/evalGovernance.ts`
  - policy definitions
  - file classification helpers
  - per-track evaluation helpers
  - final release verdict helper
- `scripts/check-eval-governance.js`
  - resolves latest eval artifacts from `data/`
  - prints readable summary
  - supports `--json` for automation
- `src/app/dashboard/actions.ts`
  - add `getEvalGovernanceStatus()` wrapper returning the shared decision object
- `src/app/dashboard/page.tsx`
  - render release verdict, blocker slices, and missing-track reasons from the shared helper
- `docs/eval-governance.md`
  - PM-readable explanation of the policy and how to interpret failures

## Don't Hand-Roll

- Do not hardcode thresholds separately in JSX.
- Do not treat missing eval artifacts as neutral.
- Do not pass a release because the average score looks good while a blocker slice still fails.
- Do not add dashboard-only logic that the CLI checker cannot reproduce.

## Validation Plan

- unit test the policy helper with synthetic track results
- verify the checker correctly selects the latest eval file per track
- verify `c56`-style blocker slices force a `block` verdict even when track score is above floor
- verify dashboard checklist reads the same verdict object as the CLI script

## Confidence

- High: repository already has the artifact readers and eval outputs needed
- High: policy-in-code approach removes the current drift risk
- Medium: blocker-slice extraction details depend on exact JSON shapes across all eval files

## Sources

- `package.json`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `src/app/dashboard/actions.ts`
- `src/app/dashboard/page.tsx`
- `data/eval-state-*.json`
