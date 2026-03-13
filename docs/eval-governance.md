# Eval Governance

EzyBot release decisions are gated on three eval tracks, not a blended average.

## Required Tracks

- `eval:state`
  - Floor: `95%`
  - Known blocker conversations: `c15`, `c28`
- `eval:unhappy`
  - Floor: `90%`
  - Known blocker conversation: `c56`
  - Known blocker category: `synonym_hinglish_service`
- `eval:normal`
  - Floor: `95%`
  - Missing artifact blocks release until `npm run eval:json` is produced

## Release Rules

- A release is `Blocked` if any required track is missing.
- A release is `Blocked` if any required track score falls below its floor.
- A release is `Blocked` if a known blocker conversation or category still has unresolved failures.
- A release is `Pass` only when all required tracks meet floor and all blocker slices are clear.
- A release is `Warn` only for future optional-track or advisory policies; the current policy has no optional tracks.

## Current Operating Commands

- `npm run eval:state`
- `npm run eval:unhappy`
- `npm run eval:json`
- `npm run eval:governance`
- `npm run eval:governance:json`

## Updating Policy

- Add new blocker conversations or categories in [`src/lib/evalGovernance.ts`](/C:/Coding/EzyBot/ezybot/src/lib/evalGovernance.ts).
- Keep dashboard and CLI aligned by updating the shared policy only there.
- When a blocker class is resolved permanently, remove it from the policy only after the regression dataset protects it.
