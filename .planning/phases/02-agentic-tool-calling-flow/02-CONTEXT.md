# Phase 2: Agentic Tool-Calling Flow - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `handleMaidHireAgentic()` — a new LLM tool-calling handler that replaces the deterministic 8-step state machine for the maid_hire intent. The same 7 fields (phone, location, service_type, schedule, salary_range, family_size, has_experience) are collected, but the LLM decides the order and phrasing using tool calls to save each field. Gated behind `USE_AGENTIC=true` in `.env.local` for safe rollback to the deterministic path.

</domain>

<decisions>
## Implementation Decisions

### Tool Set Design
- **8 tools total**: 7 save tools (one per field) + 1 escalate tool
  - `save_phone(phone: string)` — validates via `isValidPhone()`, returns success or error with re-ask instruction
  - `save_location(location: string)` — validates via `validateLocation()`
  - `save_service_type(service_type: string)` — validates via `validateServiceType()`
  - `save_schedule(schedule: string)` — validates via `validateSchedule()`
  - `save_salary_range(salary_range: string)` — optional field, accepts any non-empty value
  - `save_family_size(family_size: string)` — optional field, accepts any non-empty value
  - `save_has_experience(has_experience: string)` — optional field, accepts any non-empty value
  - `escalate()` — used only for mid-flow anger/complaints/urgent human handoff (NOT for normal completion)
- **One tool call per turn** — LLM never calls multiple tools in one turn
- **Validate in each tool** — reuse existing validators from `dataExtractor.ts`; if invalid, return `{success: false, error: "Invalid value. Re-ask: '...'"}` so LLM re-asks naturally
- **No `ask_question` tool** — LLM generates all conversation text naturally; tools only save data
- **No `get_collected_data` tool** — state is injected into system prompt each turn (see Integration Points)
- **Normal completion** — auto-triggered by `route.ts` when all required fields (`phone`, `location`, `service_type`, `schedule`) are collected; no explicit "complete" tool needed

### Conversation Order & Style
- **Flexible order** — LLM decides what to ask based on what's still missing (system prompt shows remaining fields); if user volunteers info upfront, LLM saves it and skips ahead
- **One question per message always** — system prompt instructs: ask exactly one question per turn
- **FAQ mid-flow** — LLM answers briefly then re-asks the current missing field (same behavior as deterministic flow)
- **Tone** — LLM responds naturally using its own language; no scripted response templates required (the agentic advantage)

### Failure & Fallback
- **Failed tool call definition**: a tool was called with a value that the validator rejected; counter increments by 1 per failed call, resets to 0 on any successful tool call
- **3 consecutive failures → force exit**:
  - If `phone` is collected: save partial lead to DB + send email → show "Our team will call you at [phone] within 2 hours"
  - If no `phone`: show "Our team is standing by. Call us directly or try again shortly."
- **Gemini API error (timeout/500)**: fall back to `MaidHiringFlow` deterministic handler for that single turn only; agentic resumes on next turn (same try/catch fallback pattern as existing route.ts)
- **Escalate tool** (`escalate()`): used mid-flow only when user is angry/complaining; can fire before phone is collected; triggers human handoff with partial data

### Feature Flag & Session Schema
- **`USE_AGENTIC=true`** in `.env.local` — server-wide ENV flag, no per-session toggle
- **Supabase migration required**: add `agentic_mode BOOLEAN DEFAULT false` column to `conversation_sessions` table; set to `true` for sessions handled by the agentic path
- **Eval**: run `npm run eval:state` with whatever `USE_AGENTIC` is set to; ROADMAP requires ≥95% with `USE_AGENTIC=true`

### Claude's Discretion
- Exact system prompt wording and structure for the agentic handler
- Tool parameter types and JSON schema definitions
- How remaining fields are listed in system prompt (ordered list vs JSON)
- Exact retry messaging for invalid values per field
- Whether `agentic_mode` column is set at session creation or on first agentic turn

</decisions>

<specifics>
## Specific Ideas

- Phone number is the most critical field — failure fallback logic prioritizes phone collection above all others
- MCP (Model Context Protocol) was mentioned but is not applicable: this phase uses Gemini's native function/tool calling via the Vercel AI SDK (`generateText()` with `tools` parameter)
- The `escalate()` tool mirrors the existing `[ESCALATE]` tag behavior in the deterministic flow — same email + DB logic fires, just triggered differently

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/flows/BaseFlow.ts` — `FlowState`, `CollectedData`, `SessionState`, `StepDefinition`, `ProcessResult` types all reusable; `MaidHiringFlow.ts` validators (`isValidPhone`, `validateLocation`, etc.) plug directly into tool definitions
- `src/extractors/dataExtractor.ts` — `isValidPhone()`, `validateLocation()`, `validateServiceType()`, `validateSchedule()` used inside each save tool for validation
- `src/lib/llm-logger.ts` — existing logging pipeline; agentic calls log to same `llm_logs` table with same token tracking from Phase 3
- `src/lib/guardrails.ts` — `applyStrictGuardrails()` applied to agentic responses same as deterministic
- `src/lib/email.ts` — escalation email on completion or force-exit; same function, no changes needed

### Established Patterns
- `generateText()` from `@ai-sdk/google` with `tools` parameter — same SDK, adds tool definitions to existing call
- Feature flags via `.env.local` — `DEMO_MODE` pattern: `process.env.USE_AGENTIC === 'true'`
- Try/catch with deterministic fallback — existing pattern in `route.ts` for LLM errors; agentic handler uses same wrapper
- Session state: `conversation_sessions` table with `current_state` + `collected_data` JSON — agentic handler maps to same schema; `current_state` stores next-field-needed as string

### Integration Points
- `src/app/api/chat/route.ts` — add routing: `if (USE_AGENTIC) { return handleMaidHireAgentic(...) } else { return handleMaidHireStateMachine(...) }`
- New file: `src/flows/agenticMaidHire.ts` — contains tool definitions + `handleMaidHireAgentic()` function
- Supabase `conversation_sessions` — add `agentic_mode BOOLEAN` via migration; set on session create/update
- Each turn system prompt must include: current `collected_data`, list of still-missing fields, guardrail instructions

</code_context>

<deferred>
## Deferred Ideas

- **Dashboard: agentic vs deterministic comparison** — show pass rate, slot fill rate, token cost, and avg turns per session broken out by agentic_mode. Phase 3 already complete; this would be a Phase 3.1 extension or Phase 4 data flywheel output. Captured for future planning.
- **Per-session A/B toggle** — route X% of sessions to agentic without full redeploy. Deferred; ENV-only is sufficient for Phase 2.
- **Percentage rollout** (`USE_AGENTIC_PERCENT=50`) — gradual traffic shifting. Deferred to after initial agentic validation.
- **Tool call log in Supabase** — store each tool call + result per session for deep debugging. Deferred; would go into `llm_logs` JSONB or a new `tool_call_logs` table.

</deferred>

---

*Phase: 02-agentic-tool-calling-flow*
*Context gathered: 2026-02-28*
