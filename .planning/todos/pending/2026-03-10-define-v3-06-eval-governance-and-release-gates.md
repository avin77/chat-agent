---
created: 2026-03-10T11:45:27.642Z
title: Define V3-06 Eval Governance
area: planning
files:
  - .planning/ROADMAP.md
  - .planning/STATE.md
---

## Problem

The roadmap calls out three eval tracks, but the release policy is still too high level. The project needs an explicit governance package so future releases cannot pass on a single blended score while known risk slices still fail. Without this, PM and engineering decisions will remain subjective and known unhappy-path issues like `c56` can be deprioritized too easily.

## Solution

Package V3-06 with concrete release-gate rules: which eval tracks are mandatory, what floors apply, which conversation IDs or failure slices are must-fix blockers, and how PM should interpret a mixed result set. The output should be planning-ready documentation that future implementation can wire into dashboard checklists and release decisions.
