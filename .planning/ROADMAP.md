# EzyBot Roadmap

**Project:** EzyBot
**Current milestone:** v4.0 - Production Promotion & Scaling
**Roadmap status:** In Progress
**Last updated:** 2026-03-13

---

## Baseline From Latest Evals

- 2026-03-12 `eval:state`: `100%` (V3 Complete).
- 2026-03-12 `eval:unhappy`: `98%` (V3 Complete).
- 2026-03-12 `eval:normal`: `100%`.

Interpretation: Core multi-intent agentic system is stable and ready for full production promotion. v4.0 focuses on decommissioning legacy systems and hardening the flywheel for all intents.

---

## Phases

- [x] **Phase 1-14**: Completed Milestone v2.0 and v3.0 work.
- [ ] **Phase 15: Flywheel Generalization** - Refactor mining scripts for all canonical intents beyond maid_hire.
- [ ] **Phase 16: Production Agentic Default** - Flip USE_AGENTIC=true for all users and remove deterministic fallbacks.
- [ ] **Phase 17: Shadow System 2.0** - Enable shadow simulation for agentic turns (model-vs-model comparisons).
- [ ] **Phase 18: Extreme Unhappy Path & Stack Robustness** - Add complex multi-intent and deep-stack cases to eval-unhappy.
- [ ] **Phase 19: Technical Debt Finalization** - Delete BaseFlow.ts, MaidHiringFlow.ts, and redundant state-machine code.

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1-14 | 14/14 | COMPLETE | 2026-03-13 |
| 15. Flywheel Generalization | 0/1 | Not started | - |
| 16. Production Agentic Default | 0/1 | Not started | - |
| 17. Shadow System 2.0 | 0/1 | Not started | - |
| 18. Extreme Unhappy Path | 0/1 | Not started | - |
| 19. Technical Debt Finalization | 0/1 | Not started | - |

---

## Phase Details

### Phase 15: Flywheel Generalization & Level 3 Agentic Upgrade
**Goal**: Generalize data improvement scripts and upgrade runtime to autonomous Level 3 (Reflection/Planning).
**Depends on**: Phase 14
**Requirements**: FLY-06, FLY-07, AG-L3, AG-REFL, UX-PROC
**Success Criteria**:
1. Mining scripts extract misses and golden sessions for `complaint` and `maid_registration`.
2. `AgentPlanner` replaces deterministic logic with guardrailed reflection and 3-strike retry.
3. UI shows "Processing..." indicator during reasoning turns.
4. Dashboard displays "Chain of Thought" for audited turns.
**Plans**: 15-01-PLAN.md through 15-08-PLAN.md

### Phase 16: Production Agentic Default
**Goal**: Formally promote agentic system to the sole production path.
**Depends on**: Phase 15
**Requirements**: ROLL-01, ROLL-02
**Success Criteria**:
1. `USE_AGENTIC=true` logic is moved to default behavior in `src/app/api/chat/route.ts`.
2. Legacy deterministic handlers are decommissioned and removed.
3. System passes all regression suites with no deterministic fallback active.
**Plans**: TBD

### Phase 17: Shadow System 2.0
**Goal**: Enable continuous model-vs-model evaluation for agentic responses.
**Depends on**: Phase 16
**Requirements**: SHAD-06, SHAD-07
**Success Criteria**:
1. Shadow handler successfully simulates agentic turns against production agentic responses.
2. Dashboard visualizes agreement trends between primary and shadow models.
**Plans**: TBD

### Phase 18: Extreme Unhappy Path & Stack Robustness
**Goal**: Stress-test the multi-intent stack against edge cases.
**Depends on**: Phase 17
**Requirements**: UNH-01, UNH-02
**Success Criteria**:
1. `eval-unhappy` suite includes nested intent suspensions (> 2 deep).
2. Intent stack maintains data integrity across deep suspension/resume cycles.
**Plans**: TBD

### Phase 19: Technical Debt Finalization
**Goal**: Purge all remaining legacy state-machine artifacts.
**Depends on**: Phase 18
**Requirements**: DEBT-03, DEBT-04
**Success Criteria**:
1. `src/flows/BaseFlow.ts` and `src/flows/MaidHiringFlow.ts` are deleted.
2. Over 200 lines of redundant state-machine logic are removed from core routing.
3. Codebase compile-time check passes with zero legacy flow dependencies.
**Plans**: TBD

---

## v3.0 (Completed Milestone Reference)

(Historical details omitted for brevity, see ROADMAP.md history for Phases 5-14)

---
*Roadmap updated: 2026-03-13 after initialization of Milestone v4.0.*
