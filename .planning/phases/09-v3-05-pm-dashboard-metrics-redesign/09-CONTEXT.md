# 09-CONTEXT - V3-05 PM Dashboard Metrics Redesign

## User Decisions

- Keep all current dashboard metrics; do not remove any existing card now.
- Add PM-friendly definitions for every metric (formula, source, window, interpretation).
- Add new metrics:
  - Lead Quality Score
  - Safety Net Trigger Rate
  - Semantic Paraphrase Success
  - Ambiguity Resolution Rate
  - Intent Drift Rate
  - Guardrail Bypass Attempt Rate
  - Hallucination Rate (HITL sample)
  - Escalation-after-Confusion Rate
  - Slot Retention after Switch
  - Stuck Loop Rate

## Clarification Requirements

- Dashboard must show whether intent switches are remembered (memory retention after switch).
- Dashboard must show whether NLP/LLM answer quality is improving (not only latency/volume).
- Pre-production view should include eval-track gates (`eval:state`, `eval:unhappy`, `eval`).

## Constraints

- No scope for shadow-system expansion in this pass.
- Metrics must be understandable to a PM without reading code.
- Existing cards stay visible while new metrics are added incrementally.
