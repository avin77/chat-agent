# Phase 1: LLM Extraction Integration - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `src/extractors/llmExtractor.ts` (already written) into the chat route so LLM handles slot extraction first, with field-by-field regex fallback. The state machine logic, validators, and guardrails are untouched. Eval score must remain ≥95% after integration.

This phase is extraction-only — it does not change state routing, intent detection, or conversation flow.

</domain>

<decisions>
## Implementation Decisions

### Fallback trigger conditions
- Fallback is **field-by-field**: if LLM returns null for `location` but non-null for `service_type`, regex only runs for location — LLM's service_type value is kept
- If Gemini API throws an error (quota, timeout, 500): silent fallback to full regex extraction, error logged server-side, user sees no difference
- LLM extraction runs on **every turn** in every state — no state-specific skipping

### Field conflict resolution (when both LLM and regex return non-null)
- **Phone**: regex always wins — regex is 100% reliable for 10-digit format (starts 6–9). LLM only fills phone if regex returned null.
- **Location, service_type, schedule, salary_range, family_size, has_experience**: LLM wins on conflict (better at fuzzy/Hinglish/ambiguous input)
- Both values (LLM raw + which source won) are stored in `extraction_meta` for later dashboard visibility

### Latency & timeout
- Hard timeout: **10 seconds** on the LLM extraction call (accounts for free Gemini 27B rate limits — 30 conv/min)
- After 10s timeout: cancel LLM call, run full regex extraction, continue silently
- Typing indicator in chat stays on until full response arrives — no additional UX change
- `extraction_latency_ms` logged separately from `took_ms` (full response time) to isolate extraction cost

### Extraction logging (new `extraction_meta` JSONB column in `llm_logs`)
- Schema: `{ sources: { phone: 'regex'|'llm', location: 'regex'|'llm', ... }, latency_ms: number, llm_raw: {...all 7 fields as LLM returned them...}, fallback_triggered: boolean }`
- Single Supabase migration: `ALTER TABLE llm_logs ADD COLUMN extraction_meta jsonb`
- `logLLMInteraction()` in `llm-logger.ts` gets new optional param `extractionMeta`
- Dashboard display of this data is **Phase 3** — Phase 1 only populates the column

### Claude's Discretion
- Exact error logging format for API failures (console.error is fine)
- Whether to use `Promise.race()` or `AbortController` for the 10s timeout
- How to structure the try/catch/fallback in route.ts

</decisions>

<specifics>
## Specific Ideas

- The field-specific trust rule (phone→regex, others→LLM) should be expressed as a config object, not scattered if/else:
  ```typescript
  const REGEX_WINS_FIELDS = ['phone'] as const;
  const LLM_WINS_FIELDS = ['location', 'service_type', 'schedule', 'salary_range', 'family_size', 'has_experience'] as const;
  ```
- The `extraction_meta.llm_raw` should store what the LLM actually returned before any merge — useful for debugging "why did LLM say Whitefield when user said Whitefeild" type questions
- Free tier Gemini has 30 requests/min limit — the 10s timeout is generous by design, not a performance target

</specifics>

<deferred>
## Deferred Ideas

- **Unrecognized intents jumping states** — user asked: "if user posts an intent not in state machine, will LLM jump to that state?" Phase 1 doesn't change state routing at all. This becomes relevant in Phase 2 (tool-calling flow where LLM chooses which tool to call next).
- **Dashboard rendering of extraction_meta** — who won, latency bar, LLM vs regex value comparison — Phase 3
- **Per-state LLM compliance rate** — tracking which states have highest LLM instruction failures — Phase 3 / Data Flywheel

</deferred>

---

*Phase: 01-llm-extraction-integration*
*Context gathered: 2026-02-27*
