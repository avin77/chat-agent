# Phase 3: Dashboard & Cost Tracking - Research

**Researched:** 2026-02-27
**Domain:** Next.js 16 dashboard UI, Supabase schema extension, Vercel AI SDK token tracking, async shadow mode, intent classification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Token logging: Add `prompt_tokens` (int), `completion_tokens` (int), `total_tokens` (int), `estimated_cost_usd` (decimal) to `llm_logs`
- Capture `usage` from `generateText()` in `src/app/api/chat/route.ts`; pass token counts to `src/lib/llm-logger.ts`
- Dashboard Product Health tab: lead completion rate, slot fill rate per field, lead quality score, escalation rate (effective), avg session duration, avg tokens per conversation, fallback rate, LLM error rate, shadow alignment %
- Shadow path runs ASYNC after production response is already sent (zero latency impact)
- Shadow path: same message + session state → `shadowAgenticHandler()` → compare vs production → log to `shadow_logs`
- `shadowAgenticHandler()` calls Gemini, proposes: `next_state`, `tool_calls`, `slots`
- `USE_AGENTIC` env var controls whether shadow is active (default false in Phase 3)
- Shadow logs table SQL schema specified verbatim in CONTEXT.md
- Intent classifier: new `src/extractors/intentClassifier.ts`; categories: `expected_slot_answer`, `new_intent`, `meta_question`, `clarification_request`, `off_topic`, `abusive`, `unknown`
- Run classifier BEFORE state machine processes input
- After 2 consecutive irrelevant answers in same state → offer restart or support
- Add confusion counter to state in `src/flows/MaidHiringFlow.ts`
- Alert thresholds: fallback rate > 5%, LLM error rate > 1%, eval regression < 95%, daily token spend exceeds budget, shadow alignment drops below 95%
- Alert delivery: console log + Supabase `system_alerts` table (new) OR dashboard banner

### Claude's Discretion
- Exact Gemini model for shadow handler (likely same `gemma-3-27b-it`)
- Implementation of `shadowAgenticHandler()` internals — tool-use schema design
- Alert threshold storage format (table schema for `system_alerts`)
- Dashboard UI layout for new shadow panel and alert section
- Whether to use polling or real-time for dashboard refresh

### Deferred Ideas (OUT OF SCOPE)
- Hybrid agentic tool-calling execution (Phase 2 — deferred to future milestone)
- Controlled traffic rollout
- Data flywheel scripts (Phase 4 — deferred)
- Multi-intent orchestration
- Actually flipping USE_AGENTIC=true (that happens after 7-day alignment test passes, not in this phase)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COST-01 | `generateText()` usage object captured — promptTokens, completionTokens, totalTokens stored | AI SDK v6 returns `usage.inputTokens`, `usage.outputTokens`, `usage.totalTokens` from `generateText()` — confirmed from official docs |
| COST-02 | `llm_logs` table has new columns: `prompt_tokens` (int), `completion_tokens` (int), `total_tokens` (int), `estimated_cost_usd` (float8) | SQL migration pattern with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — identical to existing v5/v6 migrations |
| COST-03 | `logLLMInteraction()` in `src/lib/llm-logger.ts` accepts and stores token fields | Current function signature: optional param pattern already established with `extractionMeta?` — same pattern for token fields |
| DASH-01 | Product Health tab displays lead completion rate, lead quality score (0–100), effective escalation rate | `getProductHealthMetrics()` in `actions.ts` already computes these values; tab exists but is empty — needs UI rendering section |
| DASH-02 | Slot-by-slot fill rate bar visualization (% of maid_hire sessions that collected each of 7 fields) | `fieldFillRates` already computed in `getProductHealthMetrics()`; needs `Bar` components in tab content |
| DASH-03 | Session duration shown: avg and p50 derived from existing `created_at`/`last_activity` columns | `avgSessionDurationMs` already computed; `last_activity` already in `conversation_sessions` schema |
| DASH-04 | Token cost metrics visible: cost per conversation, daily token spend estimate | Requires token columns COST-02 added first, then new `getTokenCostMetrics()` query in `actions.ts` |
| DASH-05 | `getProductHealthMetrics()` returns `fieldStats` with filled/failed/skipped counts per field | Current implementation returns `fieldFillRates` as % only; needs extension to return per-field `{ filled, skipped, total }` counts |
| SHADOW-01 | Shadow handler creates `shadow_logs` table entries with alignment comparisons | New Supabase table + `src/lib/shadowHandler.ts` async fire-and-forget pattern |
| SHADOW-02 | Shadow panel on dashboard: overall agreement %, state/slot/escalation agreement, 7-day trend | New `getShadowMetrics()` action + new dashboard panel |
| SHADOW-03 | Agentic readiness indicator — green if ≥95% for 7 consecutive days | Query `shadow_logs` grouped by day, compute streak |
| SHADOW-04 | 5 gate conditions checklist displayed on dashboard | Static checklist rendering + live query for gate conditions 1, 2, 3, 4 |
| CONV-01 | `src/extractors/intentClassifier.ts` — lightweight LLM classification layer | New file, lightweight generateText call with classify prompt, 7 categories |
| CONV-02 | Classifier runs BEFORE state machine processes input | Integrate into `handleMaidHireStateMachine()` at step 2.5, before `processMessage()` |
| CONV-03 | After 2 consecutive irrelevant answers → offer restart or support | Confusion counter in session state; checked in `processMessage()` result handling |
| CONV-04 | Confusion counter added to state in `MaidHiringFlow.ts` | Add `confusionCount` to `SessionState` interface + `conversation_sessions.collected_data` JSONB |
| ALERT-01 | Fallback rate > 5% alert | Query `llm_logs` for keyword fallback events; compare to total |
| ALERT-02 | LLM error rate > 1% alert | Query `llm_logs` where intent = 'SYSTEM_ERROR' |
| ALERT-03 | Eval regression < 95% alert | Read latest eval JSON file, compare `overallScore` |
| ALERT-04 | Daily token spend exceeds budget / shadow alignment drops below 95% → alert | Read from `llm_logs` aggregate + `shadow_logs`; write to `system_alerts` table |
</phase_requirements>

---

## Summary

Phase 3 is primarily a data observability phase — adding token cost tracking, completing the Product Health dashboard, building shadow mode infrastructure, improving conversation robustness, and creating an alerting layer. The work is well-scoped: the project has a solid existing foundation with `getProductHealthMetrics()` already computing most needed metrics, the dashboard tab structure already wired, and the state machine architecture that shadow mode needs to parallel.

The most important technical discovery is that **Vercel AI SDK v6 changed property names**: `generateText()` now returns `usage.inputTokens` and `usage.outputTokens` — NOT `promptTokens`/`completionTokens`. The project uses `ai: ^6.0.41` so the new names apply. Column names in the DB will use `prompt_tokens`/`completion_tokens` per the locked decision, but the TypeScript code must map from `inputTokens` → `prompt_tokens` and `outputTokens` → `completion_tokens`.

The second critical finding is that **Gemma model pricing on Google AI is currently free of charge** (confirmed from official pricing page). Cost tracking is still valuable for rate limit awareness and future-proofing, but `estimated_cost_usd` will compute to $0.00 until/unless the model switches to a paid tier. The phase should log tokens for telemetry and compute a placeholder formula that's easy to update.

**Primary recommendation:** Implement in 3 waves — (1) token schema + logger extension, (2) dashboard Product Health UI + shadow infrastructure, (3) classifier + confusion counter + alerts. This ordering ensures each wave is independently deployable and testable.

---

## Standard Stack

### Core (already in project — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | ^6.0.41 | `generateText()` + usage object | Already wired in `route.ts` |
| `@ai-sdk/google` | ^3.0.10 | Google Gemini adapter | Already in use |
| `@supabase/supabase-js` | ^2.90.1 | DB schema extension + queries | Already in all files |
| Next.js 16 (App Router) | ^16.1.6 | Server Actions (`'use server'`), client components | Dashboard already uses this |
| TypeScript | ^5 | Type safety across new interfaces | Project-wide |

### Supporting (no new installs)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^0.562.0 | Icons for dashboard panels | Alert badges, status indicators |
| `framer-motion` | ^12.27.1 | Animations already available | Optional: progress bars, transitions |

### No New Dependencies Required
This phase requires zero new npm packages. All functionality is achievable with the existing stack:
- Token tracking: Vercel AI SDK usage object (already available from `generateText()`)
- Shadow handler: same `generateText()` call pattern as extraction
- Intent classifier: same `generateText()` call pattern
- Dashboard UI: existing `StatCard`, `Bar` components + new JSX sections
- DB: `@supabase/supabase-js` already present

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended File Structure for Phase 3
```
src/
├── extractors/
│   ├── dataExtractor.ts         # existing — unchanged
│   ├── llmExtractor.ts          # existing — unchanged
│   └── intentClassifier.ts      # NEW: message classification
├── lib/
│   ├── llm-logger.ts            # MODIFY: add token params
│   ├── shadowHandler.ts         # NEW: async shadow comparison
│   └── [others unchanged]
├── flows/
│   ├── BaseFlow.ts              # MODIFY: add confusionCount to SessionState
│   └── MaidHiringFlow.ts        # MODIFY: add confusion handling
├── app/
│   ├── api/chat/
│   │   └── route.ts             # MODIFY: capture usage, add classifier, shadow fire-and-forget
│   └── dashboard/
│       ├── actions.ts           # MODIFY: extend getProductHealthMetrics(), add getTokenCostMetrics(), getShadowMetrics(), getSystemAlerts()
│       └── page.tsx             # MODIFY: populate product_health tab with all panels
supabase-migration-phase3.sql    # NEW: 4 token columns + shadow_logs + system_alerts
```

### Pattern 1: Token Usage Capture (AI SDK v6)
**What:** Extract token counts from `generateText()` return value and store to DB.
**When to use:** Every `generateText()` call in `route.ts` (main LLM + extraction LLM are separate calls).
**CRITICAL:** AI SDK v6 uses `inputTokens`/`outputTokens` — not `promptTokens`/`completionTokens`.

```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
const { text, usage } = await generateText({
    model: google('gemma-3-27b-it'),
    system: systemPrompt,
    messages: [{ role: 'user', content: latestMessage }],
});

// AI SDK v6 property names:
const promptTokens = usage?.inputTokens ?? 0;
const completionTokens = usage?.outputTokens ?? 0;
const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);

// Cost formula (Gemma is free as of 2026-02; placeholder for future paid models)
const estimatedCostUsd = totalTokens * 0; // Update if model switches to paid tier
```

### Pattern 2: Optional Parameter Extension (llm-logger.ts)
**What:** Extend `logLLMInteraction()` with optional token fields — same pattern as `extractionMeta?`.
**When to use:** Whenever extending the logger without breaking existing callers.

```typescript
// Source: existing src/lib/llm-logger.ts pattern
export async function logLLMInteraction(data: {
    conversationId: string;
    intent: string;
    systemPrompt: string;
    userMessage: string;
    fullHistory: any[];
    rawResponse: string;
    cleanedResponse: string;
    tookMs: number;
    extractionMeta?: ExtractionMeta;
    // NEW — all optional to preserve backward compat:
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
}) {
    await supabase.from('llm_logs').insert({
        // ...existing fields...
        prompt_tokens: data.promptTokens ?? null,
        completion_tokens: data.completionTokens ?? null,
        total_tokens: data.totalTokens ?? null,
        estimated_cost_usd: data.estimatedCostUsd ?? null,
    });
}
```

### Pattern 3: Async Fire-and-Forget Shadow Handler
**What:** Run shadow agentic handler after production response is sent — zero latency impact.
**When to use:** After `createUIMessageStreamResponse()` call returns, use `waitUntil` or plain Promise without await.

```typescript
// Source: Next.js edge/nodejs runtime patterns
// In route.ts, AFTER response is returned:
const response = createUIMessageStreamResponse({ stream: uiStream });

// Fire and forget — do NOT await this
if (process.env.USE_AGENTIC !== 'true') {
    runShadowHandler(conversationId, latestMessage, session, result).catch(err => {
        console.error('[Shadow] Failed:', err.message);
    });
}

return response;
```

**Alternative: `waitUntil` (Vercel serverless)** — uses `import { waitUntil } from '@vercel/functions'` to prevent function from terminating early. However this requires `@vercel/functions` package. Since this is a Next.js App Router with `runtime = 'nodejs'`, plain Promise without await is sufficient and doesn't risk premature termination in Vercel's Fluid compute.

### Pattern 4: Intent Classifier (New File)
**What:** Lightweight LLM call to classify user message intent before state machine processes it.
**When to use:** Called at top of `handleMaidHireStateMachine()` before `processMessage()`.

```typescript
// src/extractors/intentClassifier.ts
type MessageCategory =
  | 'expected_slot_answer'
  | 'new_intent'
  | 'meta_question'
  | 'clarification_request'
  | 'off_topic'
  | 'abusive'
  | 'unknown';

export async function classifyMessage(
    userMessage: string,
    currentState: string
): Promise<MessageCategory> {
    try {
        const { text } = await generateText({
            model: google('gemma-3-27b-it'),
            system: `Classify the user message. Current state: ${currentState}.
Return ONLY one word: expected_slot_answer | new_intent | meta_question | clarification_request | off_topic | abusive | unknown`,
            messages: [{ role: 'user', content: userMessage }],
        });
        const category = text.trim().toLowerCase();
        const valid: MessageCategory[] = ['expected_slot_answer', 'new_intent', 'meta_question', 'clarification_request', 'off_topic', 'abusive', 'unknown'];
        return valid.includes(category as MessageCategory) ? category as MessageCategory : 'unknown';
    } catch {
        return 'unknown'; // never throw — classifier is advisory only
    }
}
```

### Pattern 5: Shadow Handler Internal Design
**What:** Calls Gemini to simulate agentic decision, then compares to what deterministic machine did.
**When to use:** Async, after production path completes.

```typescript
// src/lib/shadowHandler.ts
interface ShadowProposal {
    next_state: string;
    slots: Record<string, string | null>;
    tool_calls: string[];
}

export async function runShadowHandler(
    conversationId: string,
    userMessage: string,
    currentState: string,
    currentSlots: Record<string, any>,
    prodNextState: string,
    prodSlots: Record<string, any>,
    turnNumber: number,
): Promise<void> {
    if (process.env.USE_AGENTIC === 'true') return; // shadow only when not live agentic

    const shadowStart = Date.now();
    try {
        const { text } = await generateText({
            model: google('gemma-3-27b-it'),
            system: SHADOW_SYSTEM_PROMPT,
            messages: [{
                role: 'user',
                content: JSON.stringify({ userMessage, currentState, currentSlots })
            }],
        });

        const proposal: ShadowProposal = JSON.parse(text);
        const agreed = proposal.next_state === prodNextState &&
                       JSON.stringify(proposal.slots) === JSON.stringify(prodSlots);

        await supabase.from('shadow_logs').insert({
            conversation_id: conversationId,
            turn_number: turnNumber,
            current_state: currentState,
            user_message: userMessage,
            prod_next_state: prodNextState,
            prod_slots: prodSlots,
            shadow_proposal: proposal,
            agreed,
            shadow_latency_ms: Date.now() - shadowStart,
        });
    } catch (err) {
        console.error('[Shadow] Error:', (err as Error).message);
        // swallow — never let shadow affect production path
    }
}
```

### Pattern 6: Confusion Counter in Session State
**What:** Track consecutive irrelevant answers per state; trigger offer after 2.
**When to use:** Applied in `route.ts` after classifier runs.

```typescript
// In BaseFlow.ts SessionState interface — add:
confusionCount?: number;  // consecutive off-topic/irrelevant messages in current state

// In route.ts — after classifyMessage() result:
const isIrrelevant = ['off_topic', 'new_intent', 'abusive'].includes(classification);
const newConfusionCount = isIrrelevant ? (session.confusionCount || 0) + 1 : 0;

if (newConfusionCount >= 2) {
    // Offer restart or support — build special instruction for LLM
    // Reset confusion count after offering
}
```

### Pattern 7: Dashboard Product Health Tab (Rendering)
**What:** The tab, state, and data fetch already exist. Only the JSX render is missing.
**Confirmed:** `activeTab === 'product_health'` conditional has NO content block in current `page.tsx` — line 912 closes the llm_logs block and line 913 closes the outer div. The product_health render must be inserted before the outer `</div>`.

```tsx
{/* ═══════════════════════════════════════════════════════ */}
{/* PRODUCT HEALTH TAB                                      */}
{/* ═══════════════════════════════════════════════════════ */}
{activeTab === 'product_health' && productHealth && (
    <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Lead Completion Rate" value={`${productHealth.leadCompletionRate}%`} sub={`${productHealth.completedSessions} of ${productHealth.totalSessions}`} />
            <StatCard label="Lead Quality Score" value={productHealth.leadQualityScore} sub="out of 100" />
            <StatCard label="Effective Escalation" value={`${productHealth.effectiveEscalationRate}%`} sub="all 4 required fields" />
            <StatCard label="Avg Session Duration" value={`${Math.round(productHealth.avgSessionDurationMs / 60000)}m`} />
        </div>
        {/* Slot Fill Rates — Bar per field */}
        {/* Token Cost Cards — from getTokenCostMetrics() */}
        {/* Shadow Panel — from getShadowMetrics() */}
        {/* Alert Section — from getSystemAlerts() */}
    </div>
)}
```

### Pattern 8: Supabase SQL Migration
**What:** All three new DB changes in one migration file.
**When to use:** Run in Supabase SQL Editor once before deployment.

```sql
-- Phase 3 Migration

-- 1. Token columns on llm_logs
ALTER TABLE llm_logs
  ADD COLUMN IF NOT EXISTS prompt_tokens INT,
  ADD COLUMN IF NOT EXISTS completion_tokens INT,
  ADD COLUMN IF NOT EXISTS total_tokens INT,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd FLOAT8;

-- Index for cost aggregations
CREATE INDEX IF NOT EXISTS idx_llm_logs_created ON llm_logs(created_at DESC);

-- 2. Shadow logs table
CREATE TABLE IF NOT EXISTS shadow_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text NOT NULL,
  turn_number     int,
  current_state   text,
  user_message    text,
  prod_next_state text,
  prod_slots      jsonb,
  shadow_proposal jsonb,
  agreed          boolean,
  shadow_latency_ms int,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_logs_conv ON shadow_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_shadow_logs_created ON shadow_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_logs_agreed ON shadow_logs(agreed, created_at DESC);

-- 3. System alerts table
CREATE TABLE IF NOT EXISTS system_alerts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  alert_type  text NOT NULL,  -- 'fallback_rate', 'llm_error_rate', 'eval_regression', 'cost_anomaly', 'shadow_alignment'
  severity    text NOT NULL,  -- 'warning', 'critical'
  metric_value float8,
  threshold   float8,
  message     text,
  resolved    boolean DEFAULT false,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON system_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON system_alerts(resolved, created_at DESC);
```

### Anti-Patterns to Avoid
- **await-ing the shadow handler:** Shadow MUST be fire-and-forget. Awaiting it blocks the response.
- **Using `promptTokens`/`completionTokens` from AI SDK:** AI SDK v6 renamed these to `inputTokens`/`outputTokens`. Code using old names will get `undefined`.
- **Throwing from intentClassifier:** Classifier errors must be caught and default to `'unknown'`. Never let classifier errors propagate to state machine.
- **Adding third Gemini call serially per turn:** Both classifier and shadow handler add extra Gemini calls. Classifier must be fast (single-word output) and shadow is async. Never run them serially before the response.
- **Confusion counter in top-level `collected_data`:** Store `confusionCount` in the session state or as a separate column, not inside `collected_data` (which holds lead field values).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async background work in Next.js | Custom queue or setTimeout | Plain unawaited Promise | App Router with `runtime = 'nodejs'` supports background microtasks; setTimeout can delay GC |
| Token usage calculation | Custom tokenizer | `generateText()` usage return value | Provider-accurate counts, no tokenizer library needed |
| Real-time dashboard updates | WebSocket or SSE | `setInterval(fetchAll, 60000)` (already implemented) | Already implemented; batch analytics is sufficient per deferred decisions |
| Alert rate calculation | Complex SQL windowing | Simple count queries + application-layer math | Supabase free tier lacks window functions; `actions.ts` already uses this pattern |
| Shadow JSON parsing fallback | Complex parser | try/catch + fallback to `null` | LLM output is unpredictable; always wrap JSON.parse |

**Key insight:** The hardest problem in this phase is timing and side-effects. The shadow handler MUST not slow down the production path. The classifier MUST not throw. The token columns MUST be nullable (old logs won't have them). Use optional parameters and null-safe patterns throughout.

---

## Common Pitfalls

### Pitfall 1: AI SDK v6 Breaking Property Name Change
**What goes wrong:** Code reads `usage.promptTokens` or `usage.completionTokens` and gets `undefined`. Token columns in DB are all null.
**Why it happens:** AI SDK v6 changed the usage object property names. `ai: ^6.0.41` is in this project's package.json. Old documentation and training data show the v3 names.
**How to avoid:** Use `usage.inputTokens`, `usage.outputTokens`, `usage.totalTokens` (verified from official AI SDK reference docs).
**Warning signs:** `prompt_tokens` column always null after conversation; no TypeScript error because `any` typing.

### Pitfall 2: Shadow Handler Race Condition
**What goes wrong:** Shadow handler reads the same session from Supabase that the production path just updated — gets stale state.
**Why it happens:** Fire-and-forget runs after response, but production path has already updated `conversation_sessions` by then.
**How to avoid:** Pass all needed state data (currentState, currentSlots, prodNextState, prodSlots) as function arguments — don't re-read from DB inside the shadow handler.
**Warning signs:** `agreed` always true or always false; `current_state` in shadow_logs doesn't match expected state sequence.

### Pitfall 3: Third Gemini Call Increasing Rate Limit Pressure
**What goes wrong:** `classifyMessage()` adds a third Gemini call per maid_hire turn. With 30 RPM limit and 2 calls already per turn, classifier tips over rate limit.
**Why it happens:** `geminiRateLimiter.recordRequest()` is called for each Gemini call. Three calls per turn at 30 RPM = 10 conversation turns per minute max.
**How to avoid:** (a) Make classifier extremely lightweight (single-word response, very short prompt). (b) Only run classifier when needed (skip for START state, COMPLETE state). (c) Record rate limit usage for classifier call.
**Warning signs:** 429 errors appearing after classifier added; rate limiter logs showing 3 calls per turn.

### Pitfall 4: `fieldStats` vs `fieldFillRates` Mismatch
**What goes wrong:** DASH-05 requires `fieldStats` with `{ filled, failed, skipped }` counts. Current `getProductHealthMetrics()` only returns `fieldFillRates` as percentages.
**Why it happens:** The existing implementation was written for a different UI need.
**How to avoid:** Extend `getProductHealthMetrics()` to also track per-field skipped count separately (currently skipped fields are excluded from `fieldCounts`). Add `skipped` tracking.
**Warning signs:** Dashboard bar shows "0 skipped" for salary_range when data shows many skips.

### Pitfall 5: ProductHealth Interface Not Defined in page.tsx
**What goes wrong:** TypeScript error: `Cannot find name 'ProductHealth'`.
**Why it happens:** `useState<ProductHealth | null>(null)` appears at line 138 but no `interface ProductHealth` is defined in the file.
**How to avoid:** Add the `ProductHealth` interface before first use, matching `getProductHealthMetrics()` return shape plus new token fields.
**Warning signs:** TypeScript build error; `npm run build` fails.

### Pitfall 6: Supabase Column Not Nullable Causes Insert Failures
**What goes wrong:** All existing `logLLMInteraction()` calls (from non-maid_hire paths) fail after adding token columns WITHOUT default values.
**Why it happens:** New columns are required but callers don't pass token values.
**How to avoid:** Always use `ADD COLUMN IF NOT EXISTS prompt_tokens INT` (no NOT NULL, no DEFAULT) — columns default to NULL.
**Warning signs:** LLM logging fails for complaint/general/helper_reg intents after migration.

### Pitfall 7: Shadow Handler JSON Parse Failure
**What goes wrong:** `JSON.parse(text)` throws because Gemini returns markdown-wrapped JSON or partial JSON.
**Why it happens:** LLMs commonly wrap JSON in ```json ... ``` fences or add commentary.
**How to avoid:** Strip markdown fences before parsing, or use `extractJsonFromLLMResponse()` helper. Always wrap in try/catch; on failure, log `agreed = null` (not false) and skip comparison.
**Warning signs:** `shadow_logs` table shows no rows despite active conversations.

---

## Code Examples

Verified patterns from official sources:

### Token Capture from generateText (AI SDK v6 - HIGH confidence)
```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
const { text, usage } = await generateText({
    model: google('gemma-3-27b-it'),
    system: systemPrompt,
    messages: [{ role: 'user', content: latestMessage }],
});

// AI SDK v6 property names (CONFIRMED from official reference docs):
// usage.inputTokens   — prompt tokens (was: promptTokens in v3)
// usage.outputTokens  — completion tokens (was: completionTokens in v3)
// usage.totalTokens   — total (may differ from input+output due to reasoning)
// usage.totalUsage    — aggregated across multi-step (single step = same as usage)

const promptTokens = usage?.inputTokens ?? 0;
const completionTokens = usage?.outputTokens ?? 0;
const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);
// gemma-3-27b-it is currently FREE (confirmed from ai.google.dev/pricing)
// Store $0 but keep formula so it's easy to update if model goes paid
const estimatedCostUsd = 0;
```

### getProductHealthMetrics() Extension for fieldStats (DASH-05)
```typescript
// Source: existing src/app/dashboard/actions.ts pattern, extended
// Per-field detailed stats (not just %)
const fieldDetailStats: Record<string, { filled: number; skipped: number; total: number }> = {};
for (const f of ALL_FIELDS) {
    fieldDetailStats[f] = { filled: 0, skipped: 0, total: 0 };
}

for (const row of sessions) {
    const collected = row.collected_data || {};
    for (const f of ALL_FIELDS) {
        fieldDetailStats[f].total++;
        if (collected[f] === 'skipped') fieldDetailStats[f].skipped++;
        else if (collected[f]) fieldDetailStats[f].filled++;
        // else: not reached yet (missing — neither filled nor skipped)
    }
}

// return fieldStats alongside existing fieldFillRates
return {
    ...existingReturn,
    fieldStats: fieldDetailStats,  // NEW for DASH-05
};
```

### Token Cost Metrics Query (DASH-04)
```typescript
// New action in src/app/dashboard/actions.ts
export async function getTokenCostMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('llm_logs')
        .select('prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, conversation_id, created_at')
        .gte('created_at', since)
        .not('total_tokens', 'is', null);  // only rows with token data

    if (error || !data || data.length === 0) {
        return { avgTokensPerConv: 0, totalTokens: 0, estimatedDailyCost: 0, logsWithTokens: 0 };
    }

    const totalTokens = data.reduce((s, r) => s + (r.total_tokens || 0), 0);
    const totalCost = data.reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
    const uniqueConvs = new Set(data.map(r => r.conversation_id)).size;
    const avgTokensPerConv = uniqueConvs > 0 ? Math.round(totalTokens / uniqueConvs) : 0;
    const dailyCost = days > 0 ? totalCost / days : 0;

    return { avgTokensPerConv, totalTokens, estimatedDailyCost: dailyCost, logsWithTokens: data.length };
}
```

### Shadow Metrics Query (SHADOW-02, SHADOW-03)
```typescript
// New action in src/app/dashboard/actions.ts
export async function getShadowMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
        .from('shadow_logs')
        .select('agreed, current_state, shadow_proposal, created_at')
        .gte('created_at', since);

    if (!data || data.length === 0) return { overall: 0, byDay: [], totalLogs: 0, agreedCount: 0 };

    const agreed = data.filter(r => r.agreed === true).length;
    const overallPct = Math.round((agreed / data.length) * 100);

    // 7-day trend: group by date
    const byDay: Record<string, { total: number; agreed: number }> = {};
    for (const row of data) {
        const day = row.created_at.substring(0, 10);
        if (!byDay[day]) byDay[day] = { total: 0, agreed: 0 };
        byDay[day].total++;
        if (row.agreed) byDay[day].agreed++;
    }

    return { overall: overallPct, byDay, totalLogs: data.length, agreedCount: agreed };
}
```

### Alert Check Function Pattern
```typescript
// In src/app/dashboard/actions.ts — called by dashboard or scheduled
export async function checkAndWriteAlerts() {
    const metrics = await getErrorMetrics(1); // last 24h
    const tokenMetrics = await getTokenCostMetrics(1);
    const shadowMetrics = await getShadowMetrics(7);

    const alerts = [];

    // ALERT-01: Fallback rate > 5%
    const fallbackRate = metrics.total > 0 ? (metrics.safetyNetTriggers / metrics.total) * 100 : 0;
    if (fallbackRate > 5) {
        alerts.push({ alert_type: 'fallback_rate', severity: 'warning', metric_value: fallbackRate, threshold: 5, message: `Fallback rate ${fallbackRate.toFixed(1)}% exceeds 5% threshold` });
    }

    // ALERT-02: LLM error rate > 1%
    const errorRate = metrics.total > 0 ? (metrics.errorIntents / metrics.total) * 100 : 0;
    if (errorRate > 1) {
        alerts.push({ alert_type: 'llm_error_rate', severity: 'critical', metric_value: errorRate, threshold: 1, message: `LLM error rate ${errorRate.toFixed(1)}% exceeds 1%` });
    }

    // ALERT-04: Shadow alignment < 95%
    if (shadowMetrics.totalLogs > 10 && shadowMetrics.overall < 95) {
        alerts.push({ alert_type: 'shadow_alignment', severity: 'warning', metric_value: shadowMetrics.overall, threshold: 95, message: `Shadow alignment ${shadowMetrics.overall}% below 95%` });
    }

    if (alerts.length > 0) {
        await supabase.from('system_alerts').insert(alerts);
    }

    return alerts;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `usage.promptTokens` | `usage.inputTokens` | AI SDK v6 (2024-2025) | Breaking: old code gets undefined |
| `usage.completionTokens` | `usage.outputTokens` | AI SDK v6 | Breaking: old code gets undefined |
| Dashboard polling via `useEffect` only | `setInterval(fetchAll, 60000)` already implemented | Existing | No change needed |
| Shadow mode as separate deployment | Fire-and-forget async in same route | Phase 3 decision | Zero latency impact |

**Deprecated/outdated in this project's context:**
- `promptTokens`/`completionTokens` naming: replaced by `inputTokens`/`outputTokens` in AI SDK v6. Any documentation, tutorials, or examples using old names (including the REQUIREMENTS.md requirements text COST-01 which says "promptTokens, completionTokens") refers to the DB column names. The TypeScript code must use the new API names.

---

## Open Questions

1. **Confusion counter storage location**
   - What we know: `SessionState` interface in `BaseFlow.ts` has typed fields; `conversation_sessions.collected_data` is JSONB and holds lead slot data
   - What's unclear: Should `confusionCount` go into `collected_data` JSONB (no migration needed) or a new `confusion_count` INT column?
   - Recommendation: Store in `collected_data` as `__confusion: number` (with double-underscore prefix to distinguish from lead fields). No migration needed, works immediately.

2. **Rate limiter impact of classifier**
   - What we know: `geminiRateLimiter.recordRequest()` is called for each LLM call; 30 RPM limit; 2 calls already per maid_hire turn
   - What's unclear: Whether classifier adds significant rate limit pressure given real traffic volume
   - Recommendation: Only run classifier if `currentState` is not `START` or `COMPLETE` (no need to classify at those states). This makes it roughly 6/8 turns instead of 8/8.

3. **`waitUntil` vs plain Promise for shadow handler**
   - What we know: Vercel's `runtime = 'nodejs'` keeps function alive until response is sent; plain unawaited Promises may not complete after `return response`
   - What's unclear: Does Next.js 16's `runtime = 'nodejs'` on Vercel guarantee background task completion after response?
   - Recommendation: Import `{ after }` from `'next/server'` (Next.js 15+ introduced `after()` for post-response work) OR use `import { waitUntil } from '@vercel/functions'`. The `after()` API from Next.js is the cleanest solution for App Router.

4. **Gemma token pricing formula**
   - What we know: `gemma-3-27b-it` is free as of 2026-02 per official Google AI pricing page
   - What's unclear: Will it remain free? What's the formula if it becomes paid?
   - Recommendation: Store `estimated_cost_usd = 0` for now with a comment. Leave formula slot: `const PER_1K_TOKENS = 0; const estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS;`

---

## Sources

### Primary (HIGH confidence)
- `https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text` - AI SDK v6 generateText usage object: `inputTokens`, `outputTokens`, `totalTokens` property names confirmed
- `https://ai.google.dev/pricing` - Gemma 3 model pricing confirmed as "Free of charge" for input, output, and context caching
- Existing `src/app/dashboard/actions.ts` (project file read) - `getProductHealthMetrics()` already implemented; `fieldFillRates` computed; tab data fetched but UI missing
- Existing `src/app/dashboard/page.tsx` (project file read) - Product Health tab exists in tab list but NO render block for `activeTab === 'product_health'`; `ProductHealth` interface referenced but not defined
- Existing `src/lib/llm-logger.ts` (project file read) - Current signature, optional param pattern with `extractionMeta?`
- Existing `src/app/api/chat/route.ts` (project file read) - Current `generateText()` call locations; token capture is NOT yet done
- Existing `package.json` (project file read) - `ai: ^6.0.41` confirms AI SDK v6 is in use

### Secondary (MEDIUM confidence)
- `https://vercel.com/blog/ai-sdk-6` - AI SDK 6 extended usage information confirmed; detailed breakdown structure documented
- `https://github.com/vercel/ai/discussions/513` - Community discussion confirming token usage patterns

### Tertiary (LOW confidence — verify before implementing)
- Next.js `after()` API for post-response work: mentioned in training knowledge; should verify `import { after } from 'next/server'` is available in Next.js 16 before using it

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project; no new installs; AI SDK usage object structure confirmed from official reference docs
- Architecture patterns: HIGH - All patterns derived from existing codebase conventions (optional params, Supabase inserts, etc.)
- Token property names: HIGH - Directly confirmed from official AI SDK reference docs (`inputTokens`/`outputTokens`)
- Gemma pricing: HIGH - Confirmed from official Google AI pricing page (free)
- `after()` API for background tasks: LOW - Needs verification for Next.js 16 specifically
- Pitfalls: HIGH - Derived from actual code inspection (ProductHealth interface missing, no tab render block, etc.)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (30 days — stable stack, though AI SDK releases quickly so verify usage object shape if upgrading)
