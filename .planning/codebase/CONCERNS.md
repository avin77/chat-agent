# Codebase Concerns

**Analysis Date:** 2026-02-27

## Tech Debt

**File System Logging in Production API Route:**
- Issue: Debug logging writes to `chat_debug.log` on disk synchronously in every request path. This is a production liability — unbounded file growth, disk I/O blocking requests, and secrets/PII may be logged.
- Files: `src/app/api/chat/route.ts` (lines 113, 189, 194, 229, 372, 397, 426, 488, 590, 597)
- Impact: Disk storage exhaustion over weeks in production; potential data privacy breach if logs contain sensitive conversation data; file I/O latency directly affects response times.
- Fix approach: Remove all `fs.appendFileSync()` calls or replace with structured logging to Supabase `llm_logs` table only. If debugging needed, use environment flag to gate logging.

**Monolithic Chat Route (774 lines):**
- Issue: `src/app/api/chat/route.ts` handles intent detection, session management, state machine orchestration, LLM calls, guardrails, escalation, DB writes, and email sends in a single 774-line file. This makes it difficult to test, debug, or modify specific behaviors.
- Files: `src/app/api/chat/route.ts`
- Impact: Hard to unit test individual concerns; state machine logic mixed with LLM orchestration; escalation logic replicated for `maid_hire` (lines 462–522) and other intents (lines 625–712).
- Fix approach: Extract concerns into modules: `SessionManager`, `StateMachineOrchestrator`, `EscalationHandler`, `ResponseProcessor`. Use dependency injection to pass dependencies.

**Duplicate Business Logic:**
- Issue: Escalation logic (phone + intent checks) exists in two forms: deterministic for maid_hire state machine (line 383) and LLM-triggered for all intents (line 628). DB tables and email templates differ between paths.
- Files: `src/app/api/chat/route.ts` (lines 383, 463–522 vs. 644–712)
- Impact: Hard to maintain consistent escalation rules; changes to one path don't propagate; phone validation happens differently in each path.
- Fix approach: Create unified `EscalationService` that handles both state machine and LLM escalation with single phone/intent checks.

**Large Dashboard Component (916 lines):**
- Issue: `src/app/dashboard/page.tsx` is a monolithic client component with 14 metrics sections, tabs, filters, and state management for all data types. JSX tree is deeply nested without component extraction.
- Files: `src/app/dashboard/page.tsx` (916 lines)
- Impact: Long re-renders; hard to optimize individual sections; state management spreads across the file; testing individual metrics is impractical.
- Fix approach: Extract metrics into separate client components (`IntentBreakdown`, `FlowFunnel`, `EvalResults`, `HealthMetrics`). Use React.memo for expensive calculations.

**Repeated Area Lists in Multiple Files:**
- Issue: `BENGALURU_AREAS` array is defined identically in both `src/flows/MaidHiringFlow.ts` (line 6) and `src/extractors/dataExtractor.ts` (line 86). Changes to one aren't propagated.
- Files: `src/flows/MaidHiringFlow.ts`, `src/extractors/dataExtractor.ts`
- Impact: Risk of out-of-sync location validation between state machine and extraction layers.
- Fix approach: Move to `src/core/config.ts` and import in both files.

**Keyword Fallback Heuristic (fragile):**
- Issue: Lines 341–365 in `src/app/api/chat/route.ts` try to detect if LLM asked the right question by checking for state-specific keywords. If LLM doesn't mention all keywords but asks correct question, it still gets replaced.
- Files: `src/app/api/chat/route.ts` (lines 352–365)
- Impact: Keyword fallback may override correct LLM responses; masks real LLM instruction-following failures.
- Fix approach: Improve fallback logic to verify presence of key slot-name (e.g., "phone" for ASK_PHONE), not just keywords. Or disable fallback if LLM confidence is high.

## Known Bugs

**Conversation ID Generation Inconsistency:**
- Symptoms: Conversation may have multiple IDs if frontend doesn't send `x-conversation-id` header consistently. Debug log shows `BodyID`, `HeaderID`, `ResolvedID` mismatch.
- Files: `src/app/api/chat/route.ts` (lines 423, 426)
- Trigger: Reload page without saved conversation ID; fresh chat widget instance.
- Workaround: Always send conversation ID from frontend (see `src/components/chat/ChatWidget.tsx` for how to save/persist it).

**Session State Not Reset on Intent Switch:**
- Symptoms: If user switches from `maid_hire` → `complaint` intent, old state machine session data is overwritten, but escalation logic may still reference old collected data.
- Files: `src/app/api/chat/route.ts` (lines 150–164)
- Trigger: User asks about maid hiring, then says "I have a complaint about a previous maid." Intent switches but old slots remain in `collectedData`.
- Workaround: Intent detector is conservative (requires strong maid_hire or complaint keywords); general questions don't trigger reset.

**Email Fallback Mode Doesn't Fail Gracefully:**
- Symptoms: If Gmail SMTP fails and no `GMAIL_USER`/`GMAIL_PASS`, email silently falls back to mock mode and logs `📧 [MOCK EMAIL]` instead of alerting admin.
- Files: `src/lib/email.ts` (lines 16, 42)
- Trigger: Production deployment with missing `GMAIL_USER` env var or SMTP timeout.
- Workaround: Always set Gmail credentials or implement Resend fallback explicitly (currently not used).

**Phone Validation Regex Doesn't Match All Indian Patterns:**
- Symptoms: Landline numbers (starting with 0) or international format (+91) may not be properly validated or extracted.
- Files: `src/extractors/dataExtractor.ts` (line 45: `/^[6-9]\d{9}$/` and line 26: multiple patterns)
- Trigger: User enters landline (0832...) or +91 prefix without space.
- Workaround: Current regex in lines 25–28 attempts to handle +91 and 91 prefix, but extraction assumes 10-digit normalization.

**Family Size Extraction Too Greedy:**
- Symptoms: Message like "I have 3 kids and expect 15k salary" will extract `family_size='3'` correctly, but salary extraction also sees "3" and may confuse it.
- Files: `src/extractors/dataExtractor.ts` (lines 208–242; guards attempt to block salary patterns line 214)
- Trigger: User provides family size and salary in same message.
- Workaround: Guard at line 214 checks for `salary|budget|per month` but not exhaustive.

## Security Considerations

**User PII Stored in Full Conversation JSON:**
- Risk: Full conversation text (messages array) is stored in Supabase `leads`, `complaints`, `helper_registrations`, `general_enquiries` tables as JSONB. No encryption at rest; backups contain user phone/name.
- Files: `src/app/api/chat/route.ts` (lines 482, 656, 663, 668)
- Current mitigation: Supabase has row-level security enabled (if configured); conversation_id is indexed for retrieval.
- Recommendations: (1) Encrypt sensitive fields (phone, name) at application level before storing. (2) Implement data retention policy (delete after 90 days). (3) Audit Supabase RLS policies. (4) Add PII scrubbing to conversation before storage.

**HTML Email Injection Risk:**
- Risk: User-provided data (name, phone, location) is HTML-escaped in email templates (line 494 escape function), but only in some places. `${esc(...)}` is applied, but pattern is manual and error-prone.
- Files: `src/app/api/chat/route.ts` (lines 494–512, 679–694)
- Current mitigation: Basic HTML escape function (replace &<>"'); no URL/script validation.
- Recommendations: Use a library like `xss` or `sanitize-html` for robust email templating. Or use template literals with auto-escaping library.

**Phone Numbers Leaked in Guardrails Errors:**
- Risk: Phone detection in guardrails logs a warning (line 43) but doesn't mask the number. If logs are exposed, phone numbers are visible.
- Files: `src/lib/guardrails.ts` (line 43)
- Current mitigation: Logs go to console (visible to dev only in local); Supabase llm_logs table may be restricted.
- Recommendations: Mask phone numbers in all logs: `9876543210` → `98*****210`. Or exclude from logging entirely.

**No Rate Limiting on Escalation Email Spam:**
- Risk: Each escalation sends an email. If a single conversation keeps hitting escalation condition (e.g., stuck in loop), admin gets flooded with emails. No per-conversation email throttling.
- Files: `src/app/api/chat/route.ts` (lines 495–517, 683–698)
- Current mitigation: `alreadyEscalated` check (line 464, 631) prevents duplicate DB inserts but not email sends if session is reset.
- Recommendations: Add exponential backoff: don't re-email same conversation_id within N minutes. Or batch daily escalations.

**Gemini API Key in Environment (Standard Risk):**
- Risk: `GOOGLE_GENERATIVE_AI_API_KEY` is in `.env.local` and passed to `google()` function. If `.env.local` is accidentally committed, key is compromised. Vercel environment variables are encrypted but not rotated automatically.
- Files: `.env.local` (not in repo, but referenced in `src/app/api/chat/route.ts` line 1)
- Current mitigation: `.env.local` in `.gitignore`; Vercel UI restricts env var viewing to admins.
- Recommendations: (1) Use API key rotation on schedule (quarterly). (2) Monitor API key usage for anomalies. (3) If compromised, regenerate key in Google Cloud console immediately.

## Performance Bottlenecks

**LLM Call Latency Affects User Experience:**
- Problem: Average LLM latency reported on dashboard is variable (50–500ms depending on model load). Streaming response is not used; entire response waits for LLM to finish (generateText, not streamText).
- Files: `src/app/api/chat/route.ts` (lines 285–289, 556–560)
- Cause: Using `generateText()` instead of `streamText()` to enable safety net fallback logic. State machine with narrow prompt is deterministic but still hits LLM for every turn.
- Improvement path: (1) Cache LLM responses for FAQ questions. (2) Use streaming with safety net as fallback (complex). (3) Pre-compute state machine responses without LLM for deterministic states (e.g., "phone collected, now ask location").

**Dashboard Data Queries Are Not Paginated:**
- Problem: `getDashboardStats()`, `getFlowFunnel()`, `getRecentConversations()` fetch all rows matching date filter with no pagination or limits (except `limit: 20` for recent conversations).
- Files: `src/app/dashboard/actions.ts` (lines 14–20, 62–94, 97–100)
- Cause: Early assumption of small data volume; no indexes on `created_at`, `last_activity`.
- Improvement path: (1) Add `.limit(N)` and `.range(offset, offset+N)` to Supabase queries. (2) Index `conversation_sessions(created_at)`, `leads(created_at)`. (3) Cache dashboard stats (refresh every 5 min).

**File System Logging Blocks on Every Request:**
- Problem: `fs.appendFileSync()` is synchronous; blocks request processing until disk write completes. With high traffic, disk contention can cause request timeouts.
- Files: `src/app/api/chat/route.ts` (multiple lines)
- Cause: Chosen for simplicity; async would require buffer management.
- Improvement path: Remove file logging entirely; use Supabase `llm_logs` table for all debugging. If file logging is required, use async `fs.appendFile()` with a queue.

**State Machine Processing Is O(n) on Steps:**
- Problem: `processMessage()` in `src/flows/BaseFlow.ts` iterates through all steps to validate, find next state, etc. With 8 steps, this is negligible, but logic is repeated in multiple places.
- Files: `src/flows/BaseFlow.ts` (lines 103–111, 143–149)
- Cause: No indexing or caching of step definitions.
- Improvement path: Not a critical bottleneck given small step count. Only optimize if step count grows significantly.

## Fragile Areas

**State Machine Step Validators Are Tightly Coupled to Extractors:**
- Files: `src/flows/MaidHiringFlow.ts`, `src/extractors/dataExtractor.ts`
- Why fragile: Step validators call `extractLocation()`, `validatePhone()`, etc., but extractors are also called independently. If an extractor's logic changes, both paths must be tested.
- Safe modification: (1) Centralize all validation in a `Validators` module. (2) Write comprehensive tests for each validator (currently missing). (3) Ensure extractors and validators use same underlying regex patterns.
- Test coverage: No unit tests for validators or extractors; only integration test in eval scripts.

**Intent Detection Regex Patterns Are Over-Sensitive:**
- Files: `src/app/api/chat/route.ts` (lines 76–101)
- Why fragile: Line 85 matches "need maid" but also triggers on "I don't need a maid" (negative case). Line 88 has overlapping patterns that could match false positives.
- Safe modification: (1) Add negative lookahead assertions (e.g., `(?<!don't)need\s+maid`). (2) Require word boundaries around intent keywords. (3) Write test cases for false positives (e.g., "don't hire", "not looking").
- Test coverage: No unit tests for intent detection.

**Guardrails Apply Too Broadly:**
- Files: `src/lib/guardrails.ts`, `src/app/api/chat/route.ts` (applied at lines 338, 594)
- Why fragile: Price blocking pattern `/₹\s*\d+/gi` may block legitimate numbers in context (e.g., "8 months old — expected ₹15k budget"). Fallback for "i don't know" (line 47) overwrites LLM response even if correct.
- Safe modification: (1) Only block prices in response if intent is NOT `maid_hire` (salary acknowledgments are allowed). (2) Make guardrails configurable per intent. (3) Test on real conversations to identify false positives.
- Test coverage: No unit tests for guardrails output.

**Keyword Fallback Masks Root Causes:**
- Files: `src/app/api/chat/route.ts` (lines 341–365)
- Why fragile: If fallback appends correct question, you lose visibility into whether LLM was confused or prompt was unclear. No metrics tracking how often fallback fires vs. when it's necessary.
- Safe modification: (1) Track fallback firing in metrics. (2) Add debug logging showing LLM response before fallback. (3) Consider disabling fallback for certain states where LLM is known to work well.
- Test coverage: No visibility into fallback rate; metrics not exposed.

**LLM Fallback Messages Are Hard-Coded:**
- Files: `src/app/api/chat/route.ts` (lines 311–328)
- Why fragile: Eight different fallback paths, each hard-coded. If step definitions change, fallbacks may not reflect actual questions asked. No guarantee fallback matches step definition.
- Safe modification: (1) Always pull fallback from `step.question` (currently done on line 315, but not consistently). (2) Remove hard-coded branches; use step definition as single source of truth. (3) Add assertion that fallback text matches step's expected question format.
- Test coverage: No tests verifying fallback text matches step definitions.

## Scaling Limits

**Supabase Row Limits:**
- Current capacity: ~1M rows per table is comfortable; ~10M rows starts to require optimization.
- Limit: At current rate (~100 conversations/day), will reach 1M rows in ~27 years. No immediate concern, but once prod traffic increases 10x, indexing and partitioning required.
- Scaling path: (1) Implement archival: move conversations older than 1 year to cold storage. (2) Add indexes on `created_at`, `conversation_id`. (3) Partition tables by month (Supabase supports this). (4) Set up automated cleanup of old records.

**LLM API Rate Limit (30 req/min):**
- Current capacity: 30 requests per minute for Gemma 3 free tier.
- Limit: At ~100 conversations/day × 5 turns avg = 500 req/day ÷ 1440 min/day ≈ 0.35 req/min. Safe. But if traffic spikes to 1000 conv/day, will hit 3.5 req/min (still under limit). Concurrent requests during peak hours are not rate-limited per-request, only per-minute aggregate.
- Scaling path: (1) Request quota increase from Google (paid tier). (2) Implement request queuing/batching. (3) Cache common responses (FAQ answers). (4) Use cheaper model as fallback (Gemini Nano).

**Database Connection Pool:**
- Current capacity: Supabase JS client uses a single connection per request. No connection pooling. Each API call opens a new connection.
- Limit: Supabase Free tier allows ~10 simultaneous connections. At 1000 concurrent users (unlikely), would exhaust pool.
- Scaling path: (1) Upgrade to Supabase Pro (100 concurrent connections). (2) Use connection pool (e.g., pgBouncer) at application layer. (3) Reduce connection churn by reusing client instances.

**Storage Growth:**
- Current capacity: `chat_debug.log` grows unbounded; ~1–5 KB per request × 500 req/day ≈ 2.5 MB/day = 75 MB/month.
- Limit: Vercel serverless ephemeral storage is limited; `/tmp` has ~512 MB. Writing to project root `/chat_debug.log` may not persist across deployments.
- Scaling path: (1) Stop writing to filesystem; use Supabase or external logging service. (2) If debugging required, implement log rotation.

## Dependencies at Risk

**Vercel AI SDK (`ai` package):**
- Risk: Rapidly evolving; major version changes frequently. Breaking changes in streaming APIs and model interfaces.
- Impact: Updating `ai` from v6 → v7 requires refactoring chat route and response handling.
- Migration plan: (1) Pin version in package.json. (2) Watch release notes for deprecations. (3) Abstract LLM calls behind a service layer (`src/lib/llm-client.ts`) so model/SDK changes don't cascade. (4) When updating, test eval scores first.

**Supabase JS Client:**
- Risk: Large dependency; Supabase API changes may require client updates.
- Impact: Type safety depends on auto-generated types; if schema changes, types become stale.
- Migration plan: (1) Use Supabase TypeScript codegen to auto-generate types from schema. (2) Run type generation in CI/CD. (3) Test Supabase connectivity in health checks.

**Tailwind CSS v4 (Recent Major Upgrade):**
- Risk: v4 uses different syntax (`@layer base`); configuration changed significantly. Older Next.js versions don't support it well.
- Impact: Currently using v4 with PostCSS v4 plugin; any rollback to v3 requires CSS syntax changes.
- Migration plan: Keep v4; don't downgrade. If issues arise, check GitHub issues in Tailwind repo.

**Nodemailer (Email Sending):**
- Risk: Gmail SMTP auth requires "app password" (not regular Google password). App passwords can be revoked; no built-in retry logic.
- Impact: If Gmail credentials are rotated or revoked, all escalation emails fail silently.
- Migration plan: (1) Implement Resend as primary email service (already in package.json but not used). (2) Use Nodemailer as fallback only. (3) Monitor email send failures and alert on failures.

## Missing Critical Features

**No Test Framework:**
- Problem: No unit tests, integration tests, or E2E tests in source (`src/`). Eval scripts exist but are for user behavior validation, not code testing.
- Blocks: (1) Safe refactoring of large files (chat route, dashboard). (2) Validation of individual extractors/validators. (3) Regression detection.
- Recommendation: Add Vitest (lightweight, TypeScript-native). Start with critical paths: intent detection, phone extraction, state machine transitions. Aim for 50%+ coverage of `src/lib/` and `src/extractors/`.

**No Structured Error Reporting:**
- Problem: Errors are logged to console or Supabase, but there's no centralized error tracking (e.g., Sentry). Critical errors (LLM failures, DB failures) are caught but not aggregated.
- Blocks: Production monitoring; can't see error trends or alerts.
- Recommendation: Integrate Sentry or LogRocket for error tracking. At minimum, flag all `catch()` blocks with a structured error code.

**No Metrics/Alerting:**
- Problem: Dashboard shows metrics but doesn't alert on degradation. No threshold monitoring (e.g., if error rate > 10%, alert admin).
- Blocks: Proactive issue detection; issues discovered reactively by users.
- Recommendation: (1) Set up Supabase alerts for failed queries. (2) Use Vercel analytics for request latency/errors. (3) Implement custom alert logic (e.g., if `intent='SYSTEM_ERROR'` count > 5 in last hour, email admin).

**No Conversation Exportability:**
- Problem: Conversations are stored in Supabase but not easily exported by users. No CSV export, no conversation history UI.
- Blocks: Auditing, compliance; users can't review their own conversations.
- Recommendation: Add `/api/export-conversation` endpoint that returns conversation as JSON or CSV. Require authentication.

## Test Coverage Gaps

**Intent Detection:**
- What's not tested: Regex patterns for complaint, maid_hire, helper_reg, general intents. False positive/negative rate unknown.
- Files: `src/app/api/chat/route.ts` (lines 76–101)
- Risk: Intent mis-classification routes conversation to wrong flow; escalation logic differs by intent.
- Priority: High — intent is first decision point.

**State Machine Transitions:**
- What's not tested: All state transitions for maid_hire flow. Edge cases: multi-slot extraction, backtrack, FAQ during flow, gibberish.
- Files: `src/flows/BaseFlow.ts`, `src/flows/MaidHiringFlow.ts`
- Risk: Invalid state transition; stuck sessions; escalation triggered prematurely.
- Priority: High — state machine is core feature.

**Phone Extraction and Validation:**
- What's not tested: Different phone formats (+91, 0, 10-digit), edge cases (landlines, invalid prefixes).
- Files: `src/extractors/dataExtractor.ts` (lines 24–47)
- Risk: Valid phone numbers rejected; invalid numbers accepted; escalation fails due to bad phone.
- Priority: High — phone is required for escalation.

**Location Extraction (Fuzzy Matching):**
- What's not tested: Levenshtein distance threshold; typo tolerance (e.g., "indranagar" vs. "indiranagar").
- Files: `src/extractors/dataExtractor.ts` (lines 101–145)
- Risk: Misspelled areas not extracted; wrong areas accepted.
- Priority: Medium — used for validation but fuzzy match may have false positives.

**Guardrails (Price Blocking, Link Removal):**
- What's not tested: Edge cases where guardrails should NOT fire (e.g., salary acknowledgment). False positive rate.
- Files: `src/lib/guardrails.ts`
- Risk: Legitimate responses blocked; security issues not caught.
- Priority: High — affects user experience directly.

**Email Sending:**
- What's not tested: Fallback behavior if Gmail fails. HTML escaping correctness.
- Files: `src/lib/email.ts`, email templates in `src/app/api/chat/route.ts`
- Risk: Escalation emails not sent; HTML injection; recipient list handling.
- Priority: Medium — escalation is critical but email is non-blocking.

**Dashboard Data Queries:**
- What's not tested: Latency of dashboard queries on large datasets. SQL injection risk (low, using Supabase but good to verify).
- Files: `src/app/dashboard/actions.ts`
- Risk: Dashboard slow/unresponsive; incorrect metrics calculated.
- Priority: Low — dashboard is informational only.

---

*Concerns audit: 2026-02-27*
