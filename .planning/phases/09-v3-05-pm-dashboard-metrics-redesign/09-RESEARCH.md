# 09-RESEARCH - V3-05 PM Dashboard Metrics Redesign

## Research Scope

Phase 9 (V3-05) adds PM-readable metric definitions and new reliability metrics without removing current dashboard cards.

Primary unknowns researched:
- Which metrics are robust for agentic chat quality and operations
- How to define each metric so PMs can trust trend changes
- How to avoid misleading/vanity KPIs in LLM products
- How to instrument memory/orchestration quality for multi-intent flows

## Standard Stack

Use this stack (prescriptive):
- Existing Next.js dashboard server actions in `src/app/dashboard/actions.ts`
- Supabase as source-of-truth tables (`conversation_sessions`, `llm_logs`, `system_alerts`)
- Eval JSON artifacts (`data/eval-state-*.json`) for benchmark-style metrics
- Metric catalog in code (single registry: id, formula, source, window, threshold)
- Daily aggregation SQL view for expensive metrics (do not compute all in UI request path)
- HITL sample workflow for hallucination auditing (small daily sample, not full automation)

## Architecture Patterns

### 1) Metric Contract Registry

Create a typed registry where each metric has:
- `metric_id`
- `display_name`
- `formula`
- `source_tables`
- `window`
- `owner`
- `thresholds` (warn/critical)
- `interpretation` (what up/down means)

Reason: PM confusion drops when every number has an explicit contract.

### 2) Base Events -> Derived Metrics

Do not compute business metrics directly from UI heuristics.
Use base events then derive metrics:
- events: `intent_switch`, `resume_success`, `slot_overwrite`, `question_repeat`, `repair_stage`
- derived: intent drift, slot retention, stuck loop, ambiguity resolution

### 3) Slice-First Health Gates

Global averages hide failures. Every metric should support slicing by:
- intent
- state
- failure category
- eval dataset (`state`, `unhappy`, `normal`)

### 4) Memory/Orchestration Traceability

For multi-intent behavior, expose trace rows with:
- prior active intent
- new active intent
- resume result
- slot diff before/after switch

Without this, PM cannot verify "LLM remembered prior intent".

## Metric Definitions (Recommended)

Use these formulas for the newly requested metrics:

- Lead Quality Score
  - `(avg non-skipped fields collected per completed lead / total expected fields) * 100`

- Safety Net Trigger Rate
  - `safety_net_trigger_count / total_llm_turns`

- Semantic Paraphrase Success
  - `successful_repair_after_rephrase / total_rephrase_attempts`

- Ambiguity Resolution Rate
  - `ambiguous_turns_resolved_within_2_turns / total_ambiguous_turns`

- Intent Drift Rate
  - `unintended_intent_switches / total_intent_switches`

- Guardrail Bypass Attempt Rate
  - `guardrail_block_events / total_turns`

- Hallucination Rate (HITL Sample)
  - `human_labeled_hallucination_turns / sampled_turns`

- Escalation-after-Confusion Rate
  - `escalations_triggered_from_repair_stage / total_confusion_sequences`

- Slot Retention after Switch
  - `switches_with_no_required_slot_loss / total_switches`

- Stuck Loop Rate
  - `sessions_with_same_state_repeated_over_threshold / total_sessions`

## Don't Hand-Roll

- Do not hand-roll "hallucination detection" with regex only; use HITL sample labels.
- Do not hand-roll metric definitions ad hoc in JSX cards.
- Do not use only one aggregate eval score as release gate.
- Do not infer intent-memory quality from latency/word-count proxies.

## Common Pitfalls

- Mixing production telemetry and eval telemetry without labels.
- Comparing metrics across different window lengths.
- Using averages without p50/p95 and without segment slices.
- Counting retries as failures when user eventually succeeds (misreads UX quality).
- Treating escalation count as always bad (some escalations are healthy outcomes).

## Code Examples

### Example 1: metric registry shape (TypeScript)

```ts
export type MetricSpec = {
  id: string;
  name: string;
  formula: string;
  sourceTables: string[];
  window: '1d' | '7d' | '30d';
  warnThreshold?: number;
  criticalThreshold?: number;
  interpretation: string;
};
```

### Example 2: intent drift SQL sketch

```sql
select
  count(*) filter (where is_unintended = true)::float
  / nullif(count(*), 0) as intent_drift_rate
from intent_switch_events
where created_at >= now() - interval '7 days';
```

### Example 3: slot retention after switch

```sql
select
  count(*) filter (where required_slot_loss = false)::float
  / nullif(count(*), 0) as slot_retention_after_switch
from intent_resume_events
where created_at >= now() - interval '7 days';
```

## Validation Plan

- Verify each metric with one synthetic fixture and one production sample query.
- Add dashboard hover tooltip with formula + source + refresh window.
- Add pre-prod gate panel:
  - eval:state threshold
  - eval:unhappy threshold
  - eval normal threshold
  - stuck loop rate threshold
  - slot retention threshold

## Confidence

- High: architecture pattern and metric-contract approach
- Medium: semantic paraphrase and ambiguity automated scoring details (depends on available trace fields)
- Medium: hallucination sampling workload sizing (depends on PM/ops capacity)

## Sources

- OpenAI Evals guidance: https://platform.openai.com/docs/guides/evals
- Azure AI Foundry eval metrics: https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/evaluate-generative-ai-app
- Azure observability concepts: https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/observability
- OpenTelemetry GenAI semantic metrics: https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/
