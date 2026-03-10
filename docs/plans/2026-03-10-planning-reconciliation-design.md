# Planning Reconciliation Design

**Date:** 2026-03-10

## Objective

Reconcile the project planning source of truth so `.planning/ROADMAP.md` and `.planning/STATE.md` reflect the work already completed locally and package the remaining work in a PM-ready way.

## Scope

- Update `.planning/ROADMAP.md` to mark locally completed v3 phases as complete.
- Package the remaining v3 work with clearer sequencing and execution framing.
- Update `.planning/STATE.md` so resume/status flows stop reporting the outdated v2-in-progress picture.

## Design Decisions

1. `ROADMAP.md` is the primary truth for milestone sequencing.
2. `STATE.md` should summarize current execution state, not preserve outdated milestone history.
3. Remaining work should be framed as the next execution queue:
   - first reconcile planning truth,
   - then package/plan V3-04,
   - then define V3-06 governance,
   - then define V3-07 flywheel.
4. Shadow-system expansion remains explicitly out of scope and should not be treated as the next planned phase.

## Expected Outcome

- v2 baseline remains recorded as complete.
- V3-01, V3-02, V3-03, and V3-05 are shown as locally completed.
- V3-04, V3-06, and V3-07 are presented as the remaining product-hardening work.
- `STATE.md` becomes usable again for resume/status reporting.
