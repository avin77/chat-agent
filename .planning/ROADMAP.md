# EzyBot Roadmap

**Project:** EzyBot
**Current milestone:** v3.0 - Multi-Intent Reliability and PM Observability
**Roadmap status:** Planning
**Last updated:** 2026-03-03

---

## Baseline From Latest Evals

- 2026-03-03 `eval:state` (`50 conv / 192 turns`): `100%`, but recurring quality misses remain in failed-turn list (`c15 t2`, `c28 t5`).
- 2026-03-03 `eval:unhappy` (`8 conv / 48 turns`): `96%`, with concentrated failures in `c56` (`synonym_hinglish_service`, turns 4-8).
- 2026-03-02 `eval:unhappy` improved from `91%` to `96%`, but the same `c56` cluster persisted.

Interpretation: core flow is stable, but multi-intent robustness, confusion handling, and PM-grade observability still need product-level hardening.

---

## v2.0 Summary (Completed)

| # | Phase | Status |
|---|-------|--------|
| 1 | LLM Extraction Integration | COMPLETE |
| 2 | Agentic Tool-Calling Flow | COMPLETE |
| 3 | Dashboard and Cost Tracking | COMPLETE |
| 4 | Data Flywheel Scripts | Deferred to v3 |

v2 shipped successfully and is now considered baseline.

---

## v3.0 Phase Overview (Planned)

| # | Phase | Goal | Status |
|---|-------|------|--------|
| 5 | V3-01 Intent Contract + English Policy | Lock canonical intents and enforce English-only response behavior with graceful fallback | Planned |
| 6 | V3-02 Multi-Intent Orchestration | Support mid-flow intent switches without data loss via intent stack/queue | Planned |
| 7 | V3-03 Confusion Protocol 2.0 | Eliminate repeated-question loops; improve human-like recovery and escalation | Planned |
| 8 | V3-04 Response Playbooks (Knowledge Contract) | Define required response and data contract per intent | Planned |
| 9 | V3-05 PM Dashboard Metrics Redesign | Keep existing metrics, add definitions + new agentic quality and memory metrics | Planned |
| 10 | V3-06 Eval Governance (3 Tracks) | Gate releases on state + unhappy + normal eval tracks with slice thresholds | Planned |
| 11 | V3-07 Flywheel for Synonyms and Recovery | Convert production/eval misses (especially c56 class) into repeatable improvements | Planned |
| 12 | V2-TD-01 Documentation Alignment | Close v2.0 audit gaps: missing requirement IDs in REQUIREMENTS.md and empty SUMMARY frontmatter | Planned |
| 13 | V2-TD-02 Code Debt Clearance | Close v2.0 audit gaps: obsolete exports and stray comments | Planned |

Explicitly removed from v3 scope for now (PM decision): shadow-system expansion tasks.

---

## Phase 5: V3-01 Intent Contract + English Policy

**Goal:** Standardize routing contract and language policy before orchestration changes.

**Intent set (canonical):**
- `maid_hire`
- `complaint`
- `maid_registration`
- `general`

**Policy decisions:**
- Bot output remains English only.
- Non-English/Hinglish user input is still accepted for intent/slot understanding, then answered in English.
- If user asks in non-English explicitly, respond in English with a brief policy line and continue task.

**Exit criteria:**
1. All entry routes map to one canonical intent.
2. No legacy alias drift (`helper_reg`/`helper_registration` mismatch removed).
3. Language policy test cases pass in eval suite.

---

## Phase 6: V3-02 Multi-Intent Orchestration

**Goal:** Handle intent switches without resetting collected data unexpectedly.

**Core behavior:**
- Introduce `intent_stack` (active intent + suspended intents with snapshots).
- On side-intent trigger, push current intent to stack and enter new intent.
- On completion/exit of side-intent, pop and resume prior intent with preserved state.
- Store intent history per session for dashboard and auditability.

**Exit criteria:**
1. Mid-flow complaint during hire does not wipe hire slots.
2. Returning from complaint resumes the exact prior hire step.
3. Intent memory is queryable in logs and dashboard.

---

## Phase 7: V3-03 Confusion Protocol 2.0

**Goal:** Make recovery behavior human-like and loop-safe.

**Protocol:**
1. Clarify: acknowledge what was understood and restate what is missing.
2. Reframe: ask the same need differently with one concrete example.
3. Escalate/handoff: offer support or callback when repeated failures continue.

**Guardrails:**
- Do not ask the same question verbatim twice without new context.
- Track invalid-attempt streak per slot and total retries per session.
- For phone mistakes, allow multiple retries; valid input at later attempt must still continue flow.

**Exit criteria:**
1. Repeat-question rate drops below agreed threshold.
2. `c56`-style loop class has no unresolved failures.
3. Retry recovery rate improves without increasing abandonment.

---

## Phase 8: V3-04 Response Playbooks (Knowledge Contract)

**Goal:** Define what information is minimally required and how to respond for each intent.

**Maid hire minimum data:**
- phone, area, service_type, schedule

**Complaint minimum data:**
- contact, issue summary, severity, callback preference, incident timing (if available)

**Maid registration minimum data:**
- contact, role/service offered, experience, availability window, preferred areas

**Playbook standard per intent:**
- Entry confirmation line
- Required fields
- Optional fields
- Failure/repair responses
- Completion confirmation format
- Escalation criteria

**Exit criteria:**
1. Every intent has explicit required/optional schema.
2. Prompt templates reference playbook contracts, not ad-hoc rules.
3. Playbook coverage is testable via eval datasets.

---

## Phase 9: V3-05 PM Dashboard Metrics Redesign

**Goal:** Keep all existing cards, add metric definitions and new signals needed for agentic monitoring.

**Plans:** 2 plans

Plans:
- [ ] 09-01-PLAN.md — Metric registry (src/lib/metricRegistry.ts) + new agentic quality server actions in actions.ts
- [ ] 09-02-PLAN.md — Dashboard UI: Agentic Quality tab, MetricTooltip definitions, pre-production checklist panel

**Keep (no removal):**
- Completion, quality score, escalation, slot fill, token usage, latency, alerts, eval scores, conversation health.

**Add:**
- Repeat-question rate
- Intent switch success rate
- Resume success after side-intent
- Slot retry distribution (per field)
- Recovery step distribution (clarify/reframe/escalate)
- Memory retention rate after switch (did bot remember prior state/slots)
- Human handoff acceptance and completion
- Lead Quality Score
- Safety Net Trigger Rate
- Semantic Paraphrase Success
- Ambiguity Resolution Rate
- Intent Drift Rate
- Guardrail Bypass Attempt Rate
- Hallucination Rate (HITL sample)
- Escalation-after-confusion rate
- Slot Retention after Switch
- Stuck Loop Rate

**Exit criteria:**
1. Each dashboard metric has a visible definition.
2. PM can detect whether orchestration and memory behaviors improved.
3. Pre-production checklist view is driven by metrics + eval gates.

---

## Phase 10: V3-06 Eval Governance (3 Tracks)

**Goal:** Separate release quality gates by failure mode.

**Tracks:**
- `eval:state` (core flow correctness)
- `eval:unhappy` (recovery/robustness under bad inputs)
- `eval` (normal conversational regression suite)

**Release gate policy:**
- No gate passes on overall score alone.
- Track-specific floor + must-fix conversation IDs for known risk slices.
- Fail release if unhappy robustness regresses, even if state score is high.

---

## Phase 11: V3-07 Flywheel for Synonyms and Recovery

**Goal:** Turn repeated misses into deterministic improvements.

**Scope:**
- Mine synonym/phrase misses from eval and production logs.
- Feed misses into extractor synonyms + playbook examples.
- Add regression cases for each resolved miss class.

**Primary target:** `synonym_hinglish_service` error family (for example current `c56` pattern).

---

## Phase 12: V2-TD-01 Documentation Alignment

**Goal:** Ensure 100% requirements traceability and documentation accuracy for v2.0.

**Tasks:**
- Add definitions for SHADOW-01/04, CONV-01/04, and ALERT-01/04 to REQUIREMENTS.md.
- Update traceability matrix in REQUIREMENTS.md to include these IDs.
- Backfill `requirements_completed` frontmatter in SUMMARY.md files for phases 01 and 02.

**Exit criteria:**
1. REQUIREMENTS.md contains all IDs referenced in roadmap/plans.
2. All completed phase summaries correctly list their satisfied requirements.

---

## Phase 13: V2-TD-02 Code Debt Clearance

**Goal:** Clean up minor code artifacts identified in v2.0 audit.

**Tasks:**
- Remove obsolete `agenticTools` export from `src/flows/agenticMaidHire.ts`.
- Remove stray backslash comment in `src/app/api/chat/route.ts` (line 694).
- Verify dashboard gate condition hardcoding is acceptable or needs dynamic wiring.

**Exit criteria:**
1. Codebase is free of identified obsolete exports and stray comments.
2. Milestone audit tech debt items are resolved.

---

## Non-Goals (Current v3)

- Shadow-mode expansion work (intentionally deferred for now).
- Real-time streaming analytics rewrite.
- New channels/apps beyond current web flow.

---
*Roadmap updated: 2026-03-03 with v3 planning scope and phase definitions.*
