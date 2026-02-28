# Phase 3: Dashboard & Cost Tracking - Research

**Researched:** 2026-02-28 (updated — supersedes 2026-02-27 version)
**Domain:** Next.js 16 dashboard UI, Supabase schema extension, Vercel AI SDK v6 token tracking, async shadow mode, intent classification
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
| COST-01 | `generateText()` usage object captured — promptTokens, completionTokens, totalTokens stored | AI SDK v6 returns `usage.inputTokens`, `usage.outputTokens`, `usage.totalTokens` from `generateText()` — confirmed from official docs. Current route.ts uses `const { text }` — `usage` is NOT yet destructured. |
| COST-02 | `llm_logs` table has new columns: `prompt_tokens` (int), `completion_tokens` (int), `total_tokens` (int), `estimated_cost_usd` (float8) | SQL migration with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — idempotent. All new columns must be nullable (no NOT NULL, no DEFAULT) so existing callers don't break. |
| COST-03 | `logLLMInteraction()` in `src/lib/llm-logger.ts` accepts and stores token fields | Current function signature confirmed: optional param pattern already established with `extractionMeta?` — same pattern for token fields. No new params today. |
| DASH-01 | Product Health tab displays lead completion rate, lead quality score (0–100), effective escalation rate | `getProductHealthMetrics()` in `actions.ts` already computes these values. Tab exists in tab list (`'product_health'`) but has NO render block — nothing shows when clicked. |
| DASH-02 | Slot-by-slot fill rate bar visualization (% of maid_hire sessions that collected each of 7 fields) | `fieldFillRates` computed as percentages in `getProductHealthMetrics()`. For bar chart showing counts, need `fieldStats: { filled, skipped, total }` per field — NOT yet implemented. |
| DASH-03 | Session duration shown: avg and p50 derived from existing `created_at`/`last_activity` columns | `avgSessionDurationMs` already computed. `p50SessionDurationMs` NOT yet in return value — needs addition. `last_activity` column confirmed in `conversation_sessions`. |
| DASH-04 | Token cost metrics visible: cost per conversation, daily token spend estimate | Requires token columns (COST-02) added first, then new `getTokenCostMetrics()` query in `actions.ts`. Neither exists yet. |
| DASH-05 | `getProductHealthMetrics()` returns `fieldStats` with filled/failed/skipped counts per field | Current implementation returns `fieldFillRates` as % only. `fieldStats` object NOT yet in return — needs extension. |
| SHADOW-01 | Shadow handler creates `shadow_logs` table entries with alignment comparisons | New Supabase table + `src/lib/shadowHandler.ts` async fire-and-forget pattern. Neither exists yet. |
| SHADOW-02 | Shadow panel on dashboard: overall agreement %, state/slot/escalation agreement, 7-day trend | New `getShadowMetrics()` action + new dashboard panel — neither exists yet. |
| SHADOW-03 | Agentic readiness indicator — green if ≥95% for 7 consecutive days | Query `shadow_logs` grouped by day, compute streak — needs `getShadowMetrics()` to return `byDay` array and `isReady` boolean. |
| SHADOW-04 | 5 gate conditions checklist displayed on dashboard | Static checklist rendering + live query for gate conditions 1, 2, 3, 4 from `getShadowMetrics()` data. |
| CONV-01 | `src/extractors/intentClassifier.ts` — lightweight LLM classification layer | New file, lightweight generateText call with classify prompt, 7 categories. Does NOT yet exist. |
| CONV-02 | Classifier runs BEFORE state machine processes input | Integrate into `handleMaidHireStateMachine()` at step 3.5, after extractedSlots are ready and before `processMessage()` is called. Skip at START and COMPLETE states. |
| CONV-03 | After 2 consecutive irrelevant answers → offer restart or support | Confusion counter in session state checked after classifier runs. Override LLM instruction at count >= 2. Reset to 0 after offering restart. |
| CONV-04 | Confusion counter added to state in `MaidHiringFlow.ts` | Store as `collected_data.__confusion` string (no DB migration needed — `CollectedData` index signature `[key: string]: string | undefined` already permits it). |
| ALERT-01 | Fallback rate > 5% alert | Query `llm_logs` for rows where raw_llm_response is `.` or < 4 chars; compare to total. `getErrorMetrics()` already computes `safetyNetTriggers`. |
| ALERT-02 | LLM error rate > 1% alert | Query `llm_logs` where `intent = 'SYSTEM_ERROR'`. `getErrorMetrics()` already computes `errorIntents`. |
| ALERT-03 | Eval regression < 95% alert | Read latest `eval-state-*.json` from `data/` dir. `getLatestEvalResults()` already does this — check `overallScore < 95`. |
| ALERT-04 | Daily token spend exceeds budget / shadow alignment drops below 95% → alert | Read from `llm_logs` aggregate + `shadow_logs`; write to `system_alerts` table. `DAILY_TOKEN_BUDGET_USD` env var (default 0 — Gemma is free). |
</phase_requirements>

---

## Summary

Phase 3 is a data observability phase — adding token cost tracking, completing the Product Health dashboard, building shadow mode infrastructure, improving conversation robustness, and creating an alerting layer. The work is well-scoped: `getProductHealthMetrics()` already computes most needed metrics, the dashboard tab structure is wired (tab button exists), and the state machine architecture is in place for shadow mode to parallel.

This re-research pass confirms the original research findings and resolves two open questions. The most important update is that **Next.js `after()` is confirmed available in Next.js 16**: `import { after } from 'next/server'` works in Route Handlers as of Next.js 15.1 (stable), and the project uses Next.js `^16.1.6`. This is the clean solution for shadow handler fire-and-forget — no need for `@vercel/functions` or plain unawaited Promises.

The second update is a **Tailwind CSS version discrepancy**: `package.json` specifies `"tailwindcss": "^4.0.0"` and the installed version is 4.2.1, but `CLAUDE.md` states "Tailwind CSS v3". Dashboard JSX already uses v4 syntax patterns. Plans must use Tailwind v4 class patterns (same class names, but configured with `@import "tailwindcss"` not `@tailwind` directives). Since existing dashboard code works, follow the existing page.tsx patterns for all new JSX.

**Primary recommendation:** Implement in 4 waves — (1) Supabase migration SQL file, (2) token logger + classifier/shadow infrastructure, (3) dashboard UI completion, (4) human verification. This ordering ensures each wave is independently testable and the schema exists before code writes to it.

---

## Standard Stack

### Core (already in project — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | ^6.0.41 (actual: 6.x) | `generateText()` + usage object | Already wired in `route.ts` |
| `@ai-sdk/google` | ^3.0.10 | Google Gemini adapter | Already in use |
| `@supabase/supabase-js` | ^2.90.1 | DB schema extension + queries | Already in all files |
| Next.js | ^16.1.6 | Server Actions (`'use server'`), `after()` from `next/server`, client components | Dashboard already uses this |
| TypeScript | ^5 | Type safety across new interfaces | Project-wide |

### Supporting (no new installs)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^0.562.0 | Icons for dashboard panels | Alert badges, status indicators |
| `framer-motion` | ^12.27.1 | Animations already available | Optional: progress bars, transitions |

### No New Dependencies Required
This phase requires zero new npm packages. All functionality is achievable with the existing stack:
- Token tracking: Vercel AI SDK usage object (already returned by `generateText()`)
- Shadow handler: same `generateText()` call pattern, plus `after()` from `next/server`
- Intent classifier: same `generateText()` call pattern
- Dashboard UI: existing `StatCard`, `Bar` components + new JSX sections in same patterns
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
│   └── intentClassifier.ts      # NEW: message classification (7 categories)
├── lib/
│   ├── llm-logger.ts            # MODIFY: add 4 optional token params
│   ├── shadowHandler.ts         # NEW: async shadow comparison → shadow_logs
│   └── [others unchanged]
├── flows/
│   ├── BaseFlow.ts              # MODIFY: add __confusion comment to CollectedData
│   └── MaidHiringFlow.ts        # unchanged (confusion stored via index signature)
├── app/
│   ├── api/chat/
│   │   └── route.ts             # MODIFY: capture usage, add classifier, shadow via after()
│   └── dashboard/
│       ├── actions.ts           # MODIFY: extend getProductHealthMetrics(), add 4 new functions
│       └── page.tsx             # MODIFY: add interfaces, state vars, product_health render block
supabase-migration-phase3.sql    # NEW: 4 token columns + shadow_logs + system_alerts
```

### Pattern 1: Token Usage Capture (AI SDK v6 — CONFIRMED)
**What:** Extract token counts from `generateText()` return value and store to DB.
**When to use:** Every `generateText()` call in `route.ts` (main LLM call + extraction LLM are separate).
**CRITICAL:** AI SDK v6 uses `inputTokens`/`outputTokens` — not `promptTokens`/`completionTokens`.

```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text (verified 2026-02-28)
const { text, usage } = await generateText({
    model: google('gemma-3-27b-it'),
    system: systemPrompt,
    messages: [{ role: 'user', content: latestMessage }],
});

// AI SDK v6 property names (CONFIRMED from official reference docs):
// usage.inputTokens   — prompt tokens (NOT promptTokens — that was v3)
// usage.outputTokens  — completion tokens (NOT completionTokens — that was v3)
// usage.totalTokens   — total tokens
// usage.inputTokenDetails.noCacheTokens / cacheReadTokens / cacheWriteTokens — sub-breakdown
// usage.outputTokenDetails.textTokens / reasoningTokens — sub-breakdown

const promptTokens = usage?.inputTokens ?? 0;
const completionTokens = usage?.outputTokens ?? 0;
const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);

// Cost formula: gemma-3-27b-it is FREE as of 2026-02 (confirmed from ai.google.dev/pricing)
const PER_1K_TOKENS = 0; // Update when model switches to paid tier
const estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS; // = 0
```

### Pattern 2: Optional Parameter Extension (llm-logger.ts)
**What:** Extend `logLLMInteraction()` with optional token fields — same pattern as `extractionMeta?`.
**When to use:** Whenever extending the logger without breaking existing callers.

```typescript
// Source: existing src/lib/llm-logger.ts pattern (read from file 2026-02-28)
// Current confirmed signature — add 4 optional params after extractionMeta:
export async function logLLMInteraction(data: {
    conversationId: string;
    intent: string;
    systemPrompt: string;
    userMessage: string;
    fullHistory: any[];
    rawResponse: string;
    cleanedResponse: string;
    tookMs: number;
    extractionMeta?: ExtractionMeta;   // existing optional — Phase 1
    // NEW — all optional, backward-compatible:
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
}) {
    await supabase.from('llm_logs').insert({
        // ...existing fields...
        extraction_meta: data.extractionMeta ?? null,
        prompt_tokens: data.promptTokens ?? null,       // NEW
        completion_tokens: data.completionTokens ?? null, // NEW
        total_tokens: data.totalTokens ?? null,           // NEW
        estimated_cost_usd: data.estimatedCostUsd ?? null, // NEW
    });
}
```

### Pattern 3: Async Post-Response Shadow Handler using `after()` (CONFIRMED — resolves open question)
**What:** Run shadow agentic handler after production response is sent — zero latency impact.
**When to use:** In Route Handler (`route.ts`) after building the response, using `after()` from `next/server`.

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/after (verified 2026-02-28)
// after() is STABLE as of Next.js 15.1. Project uses Next.js ^16.1.6. Confirmed available.
// Import path: 'next/server' (same module as NextRequest, NextResponse)

import { after } from 'next/server';

// In route.ts POST handler, INSIDE the maid_hire branch, before return:
const textId = crypto.randomUUID();
const uiStream = createUIMessageStream({
    execute: ({ writer }) => {
        writer.write({ type: 'text-start', id: textId });
        writer.write({ type: 'text-delta', delta: displayText, id: textId });
        writer.write({ type: 'text-end', id: textId });
    },
});

// Schedule shadow work AFTER response is sent — zero production latency impact
after(async () => {
    await runShadowHandler(
        conversationId,
        shadowTurnNumber,
        latestMessage,
        dbSession?.current_state ?? 'START',
        dbSession?.collected_data ?? {},
        newState,       // prod decision: next state
        collectedData,  // prod decision: slots after
    ).catch(err => console.error('[Shadow] Failed:', err.message));
});

return createUIMessageStreamResponse({ stream: uiStream });
```

**Why `after()` beats plain unawaited Promise:** In serverless environments, the process can terminate after response is sent. Plain unawaited Promises may not complete. `after()` uses `waitUntil` internally to keep the function alive until the async work finishes. This is the correct pattern for Vercel deployments.

### Pattern 4: Intent Classifier (New File)
**What:** Lightweight LLM call to classify user message intent before state machine processes it.
**When to use:** Called in `handleMaidHireStateMachine()` between step 3 (special conditions) and step 4 (processMessage). Skip at START and COMPLETE states.

```typescript
// src/extractors/intentClassifier.ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export type MessageCategory =
  | 'expected_slot_answer'
  | 'new_intent'
  | 'meta_question'
  | 'clarification_request'
  | 'off_topic'
  | 'abusive'
  | 'unknown';

const VALID_CATEGORIES: MessageCategory[] = [
  'expected_slot_answer', 'new_intent', 'meta_question',
  'clarification_request', 'off_topic', 'abusive', 'unknown',
];

export async function classifyMessage(
  userMessage: string,
  currentState: string,
): Promise<MessageCategory> {
  try {
    const { text } = await generateText({
      model: google('gemma-3-27b-it'),
      system: `You are a message classifier for a domestic help booking chatbot.
The bot is currently collecting: ${currentState}.
Classify the user's message into ONE of these categories:
- expected_slot_answer: directly answers what the bot is asking
- clarification_request: asking for more info about the current question
- meta_question: question about the service, pricing, or process
- new_intent: wants something completely different
- off_topic: irrelevant to domestic help
- abusive: rude, offensive, or threatening
- unknown: unclear

Reply with ONLY the category name. No punctuation. No explanation.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const category = text.trim().toLowerCase() as MessageCategory;
    return VALID_CATEGORIES.includes(category) ? category : 'unknown';
  } catch {
    return 'unknown'; // NEVER throw — classifier is advisory only
  }
}
```

### Pattern 5: Shadow Handler Internal Design
**What:** Calls Gemini to simulate agentic decision, then compares to what deterministic machine did.
**When to use:** Scheduled via `after()` after production path completes.

```typescript
// src/lib/shadowHandler.ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ShadowProposal {
  next_state: string;
  slots: Record<string, string | null>;
  tool_calls: string[];
}

export async function runShadowHandler(
  conversationId: string,
  turnNumber: number,
  userMessage: string,
  currentState: string,
  currentSlots: Record<string, any>,
  prodNextState: string,
  prodSlots: Record<string, any>,
): Promise<void> {
  if (process.env.USE_AGENTIC === 'true') return; // shadow only when not live agentic

  const shadowStart = Date.now();
  try {
    const { text } = await generateText({
      model: google('gemma-3-27b-it'),
      system: SHADOW_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ userMessage, currentState, currentSlots }) }],
    });

    // Strip markdown fences — Gemini sometimes wraps JSON in ```json ... ```
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let proposal: ShadowProposal;
    try {
      proposal = JSON.parse(cleaned);
    } catch {
      // Parse failure — log as null (not false, which means actual disagreement)
      await supabase.from('shadow_logs').insert({
        conversation_id: conversationId, turn_number: turnNumber,
        current_state: currentState, user_message: userMessage,
        prod_next_state: prodNextState, prod_slots: prodSlots,
        shadow_proposal: null, agreed: null,
        shadow_latency_ms: Date.now() - shadowStart,
      });
      return;
    }

    const stateAgreed = proposal.next_state === prodNextState;
    const slotKeys = ['phone', 'location', 'service_type', 'schedule', 'salary_range', 'family_size', 'has_experience'];
    const slotsAgreed = slotKeys.every(k => (prodSlots[k] ?? null) === (proposal.slots?.[k] ?? null));
    const agreed = stateAgreed && slotsAgreed;

    await supabase.from('shadow_logs').insert({
      conversation_id: conversationId, turn_number: turnNumber,
      current_state: currentState, user_message: userMessage,
      prod_next_state: prodNextState, prod_slots: prodSlots,
      shadow_proposal: proposal, agreed,
      shadow_latency_ms: Date.now() - shadowStart,
    });
  } catch (err) {
    console.error('[Shadow] Error (non-fatal):', (err as Error).message);
    // Swallow — shadow must NEVER affect production path
  }
}
```

### Pattern 6: Confusion Counter in Session State
**What:** Track consecutive irrelevant answers per state; trigger offer after 2.
**Storage:** `collected_data.__confusion` as string number (e.g. "0", "1", "2").
**Why no migration:** `CollectedData` interface already has `[key: string]: string | undefined` index signature — `__confusion` is permitted without any interface change.

```typescript
// In route.ts — after classifyMessage() result, before processMessage():
const isIrrelevant = ['off_topic', 'new_intent', 'abusive'].includes(classification);
const currentConfusion = parseInt((session.collectedData as any).__confusion || '0', 10);
const newConfusion = isIrrelevant ? currentConfusion + 1 : 0;
(session.collectedData as any).__confusion = String(newConfusion);

const triggerConfusionResponse = newConfusion >= 2;

// After processMessage(), if triggerConfusionResponse:
if (triggerConfusionResponse) {
    result.llmInstruction = `The user has given ${newConfusion} off-topic or irrelevant responses. Gently say: "It looks like you might need a different kind of help. Would you like to start over, or shall I connect you with our support team?" Do NOT re-ask the current question.`;
    (session.collectedData as any).__confusion = '0'; // reset after offering
}
```

### Pattern 7: Dashboard Product Health Tab (Current State)
**CONFIRMED from file read (2026-02-28):**
- `useState<ProductHealth | null>(null)` at line 138 — `ProductHealth` interface NOT defined anywhere in file (TypeScript error in waiting)
- Tab button `'product_health'` exists in tab list at line 140
- `fetchAll()` calls `getProductHealthMetrics(days)` and `setProductHealth(ph)` — data IS fetched
- Product Health tab render block: does NOT exist. File ends at line 916 with `)</div></div>);}`. The `activeTab === 'product_health'` block is entirely missing.
- Available helper components: `StatCard({ label, value, sub })`, `Bar({ label, value, max, color })`, `ScoreBadge({ score, verdict })`

```tsx
// Insert BEFORE the closing </div> at line 913 in page.tsx
{activeTab === 'product_health' && (
    <div className="space-y-6">
        {/* System Alerts Banner */}
        {systemAlerts.length > 0 && (
            <div className="space-y-2">
                {systemAlerts.map((alert) => (
                    <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                        alert.severity === 'critical'
                            ? 'bg-red-50 border-red-300 text-red-800'
                            : 'bg-yellow-50 border-yellow-300 text-yellow-800'
                    }`}>
                        <span className="font-semibold text-sm">{alert.severity === 'critical' ? '[CRITICAL]' : '[WARNING]'}</span>
                        <span className="text-sm">{alert.message}</span>
                        <span className="ml-auto text-xs opacity-60">{new Date(alert.created_at).toLocaleTimeString()}</span>
                    </div>
                ))}
            </div>
        )}
        {/* ... KPI cards, slot fill rates, token cost, shadow panel ... */}
    </div>
)}
```

### Pattern 8: Supabase SQL Migration
**What:** All three new DB changes in one idempotent migration file.
**When to use:** Run once in Supabase SQL Editor before deployment.

```sql
-- Phase 3 Migration
-- Run once in Supabase SQL Editor
-- Safe to re-run (all changes use IF NOT EXISTS)

-- 1. Token columns on llm_logs (nullable — existing callers unaffected)
ALTER TABLE llm_logs
  ADD COLUMN IF NOT EXISTS prompt_tokens INT,
  ADD COLUMN IF NOT EXISTS completion_tokens INT,
  ADD COLUMN IF NOT EXISTS total_tokens INT,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd FLOAT8;

CREATE INDEX IF NOT EXISTS idx_llm_logs_created ON llm_logs(created_at DESC);

-- 2. Shadow logs table (exact schema from CONTEXT.md)
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
  alert_type  text NOT NULL,
  severity    text NOT NULL,
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
- **Using old AI SDK v3 names:** `usage.promptTokens` and `usage.completionTokens` return `undefined` in AI SDK v6. Use `usage.inputTokens` and `usage.outputTokens`.
- **Plain unawaited Promise for shadow handler:** Use `after()` from `'next/server'` instead. Unawaited Promises may not complete in serverless environments after response is sent.
- **Throwing from intentClassifier:** Classifier errors must be caught and default to `'unknown'`. Never let classifier errors propagate to state machine.
- **Running classifier serially before response:** Classifier runs before `processMessage()` (not after response). Keep it fast: single-word response, short prompt, skip at START/COMPLETE states.
- **Storing confusion count in top-level slot fields:** Use `__confusion` key (double-underscore prefix distinguishes from lead fields like `phone`, `location`). Do NOT use `confusion_count` as a top-level key without prefix.
- **Adding NOT NULL to new token columns:** New columns must be nullable. Old logs won't have token data. Existing callers don't pass token values.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Post-response async work in Next.js Route Handler | Custom setTimeout, unawaited Promise, @vercel/functions | `after()` from `'next/server'` | Stable in Next.js 15.1+; handles waitUntil internally for Vercel serverless; guaranteed completion |
| Token usage calculation | Custom tokenizer library | `generateText()` usage return value | Provider-accurate counts, no additional library needed |
| Real-time dashboard updates | WebSocket or SSE | `setInterval(fetchAll, 60000)` (already in page.tsx) | Already implemented; batch analytics sufficient per deferred decisions |
| Alert rate calculation | Complex SQL windowing | Simple count queries + application-layer math | Supabase free tier; `actions.ts` already uses this pattern throughout |
| Shadow JSON parsing with fallback | Complex parser with retry | try/catch + `agreed = null` on parse failure | LLM output is unpredictable; null signals parse failure vs real disagreement |

**Key insight:** The hardest problem in this phase is timing and side-effects. The shadow handler MUST not slow down the production path. Use `after()` — it is the correct Next.js primitive for this use case, not a workaround.

---

## Common Pitfalls

### Pitfall 1: AI SDK v6 Breaking Property Name Change
**What goes wrong:** Code reads `usage.promptTokens` or `usage.completionTokens` and gets `undefined`. Token columns in DB are all null after conversations run.
**Why it happens:** AI SDK v6 renamed the usage object properties. `ai: ^6.0.41` is in this project's package.json. Old documentation and training data show v3 names.
**How to avoid:** Use `usage.inputTokens`, `usage.outputTokens`, `usage.totalTokens` — confirmed from official AI SDK reference docs (2026-02-28).
**Warning signs:** `prompt_tokens` column always null after conversation; no TypeScript error because the `usage` type may not be narrowly typed.

### Pitfall 2: Shadow Handler Runs BEFORE `after()` Resolves
**What goes wrong:** Shadow handler logs are missing from `shadow_logs`. Fire-and-forget in serverless environments terminates before completion.
**Why it happens:** Plain `promise.catch()` without `after()` may be killed when the serverless function terminates after sending response.
**How to avoid:** Use `after(() => { runShadowHandler(...).catch(...) })` — `after()` uses `waitUntil` internally to keep function alive until the async task finishes.
**Warning signs:** `shadow_logs` table is empty despite active conversations and no error in console.

### Pitfall 3: Shadow Handler Race Condition on Session Data
**What goes wrong:** Shadow handler reads stale state because production path has already updated `conversation_sessions` by the time shadow runs.
**Why it happens:** `after()` fires after response. Production path saves new state to DB. Shadow re-reading from DB gets the updated state, not the pre-turn state.
**How to avoid:** Pass all needed state data (currentState, currentSlots, prodNextState, prodSlots) as function arguments to `runShadowHandler()`. Do NOT re-read from DB inside the shadow handler.
**Warning signs:** `current_state` in `shadow_logs` doesn't match expected state sequence; `agreed` always true.

### Pitfall 4: Third Gemini Call Increasing Rate Limit Pressure
**What goes wrong:** `classifyMessage()` adds a third Gemini call per maid_hire turn. With 30 RPM limit and 2 calls already per turn (main LLM + extraction LLM), classifier can tip over rate limit.
**Why it happens:** `geminiRateLimiter.recordRequest()` is called for each Gemini call. Three calls per turn at 30 RPM = ~10 conversation turns per minute maximum.
**How to avoid:** (a) Only run classifier when `currentState` is not `FlowState.START` and not `FlowState.COMPLETE` (reduces to ~6/8 states). (b) Keep classifier prompt very short — single-word response. (c) Call `geminiRateLimiter.recordRequest()` before the classifier call.
**Warning signs:** 429 errors appearing after classifier added; rate limiter logs showing 3 calls per turn.

### Pitfall 5: `fieldStats` vs `fieldFillRates` Mismatch
**What goes wrong:** DASH-05 requires `fieldStats` with `{ filled, skipped, total }` counts. Current `getProductHealthMetrics()` only returns `fieldFillRates` as percentages. Dashboard bars show no counts.
**Why it happens:** The existing implementation was written for a simpler UI. `skipped` is excluded from `fieldCounts` (current code counts non-skipped only).
**How to avoid:** Extend `getProductHealthMetrics()` to add a separate `fieldDetailStats` loop that tracks filled/skipped/total separately (three separate counters per field, not one).
**Warning signs:** Dashboard slot fill bars show "0 skipped" for `salary_range` despite data showing skips.

### Pitfall 6: `ProductHealth` Interface Missing from page.tsx
**What goes wrong:** TypeScript error: `Cannot find name 'ProductHealth'`. Build fails.
**Why it happens:** `useState<ProductHealth | null>(null)` at line 138 references a type that is NOT defined anywhere in the file.
**How to avoid:** Add `interface ProductHealth { ... }` before first use, matching `getProductHealthMetrics()` return shape PLUS new `fieldStats` and `p50SessionDurationMs` fields.
**Warning signs:** `npm run build` fails with TypeScript error on line 138 of page.tsx.

### Pitfall 7: Supabase Column NOT NULL Causes Insert Failures
**What goes wrong:** All existing `logLLMInteraction()` calls (complaint, helper_reg, general paths) fail after adding token columns WITH NOT NULL constraint.
**Why it happens:** Existing callers don't pass token values. New columns must be nullable.
**How to avoid:** Always use `ADD COLUMN IF NOT EXISTS prompt_tokens INT` — no `NOT NULL`, no `DEFAULT`. Columns default to NULL automatically.
**Warning signs:** LLM logging fails for non-maid-hire intents after migration.

### Pitfall 8: Shadow Handler JSON Parse Failure (Silent)
**What goes wrong:** `JSON.parse(text)` throws because Gemini returns markdown-wrapped JSON. `shadow_logs` table stays empty silently.
**Why it happens:** LLMs commonly wrap JSON in ` ```json ... ``` ` fences.
**How to avoid:** Strip markdown fences before parsing: `text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()`. Then wrap `JSON.parse` in its own try/catch; on failure, log `agreed: null` (not `false`) and return.
**Warning signs:** `shadow_logs` has zero rows despite active conversations; no console errors from shadow handler.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### Token Capture from generateText (AI SDK v6 - HIGH confidence)
```typescript
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text (verified 2026-02-28)
// Current route.ts uses: const { text } = await generateText(...)
// Change to capture usage:
const { text, usage } = await generateText({
    model: google('gemma-3-27b-it'),
    system: systemPrompt,
    messages: [{ role: 'user', content: latestMessage }],
});

// AI SDK v6 property names (CONFIRMED):
const promptTokens = usage?.inputTokens ?? 0;      // NOT promptTokens
const completionTokens = usage?.outputTokens ?? 0;  // NOT completionTokens
const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);

// gemma-3-27b-it is FREE (confirmed from ai.google.dev/pricing as of 2026-02)
const PER_1K_TOKENS = 0; // Update if model switches to paid tier
const estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS; // = 0
```

### getProductHealthMetrics() Extension for fieldStats (DASH-05)
```typescript
// Source: existing src/app/dashboard/actions.ts pattern, extended (read from file 2026-02-28)
// Add BEFORE the existing fieldFillRates block (after the main sessions loop):

const fieldDetailStats: Record<string, { filled: number; skipped: number; total: number }> = {};
for (const f of ALL_FIELDS) {
    fieldDetailStats[f] = { filled: 0, skipped: 0, total: 0 };
}
for (const row of sessions) {
    const collected = row.collected_data || {};
    for (const f of ALL_FIELDS) {
        fieldDetailStats[f].total++;
        if (collected[f] === 'skipped') fieldDetailStats[f].skipped++;
        else if (collected[f] && collected[f] !== 'skipped') fieldDetailStats[f].filled++;
        // else: not yet reached — counts in total but not filled or skipped
    }
}

// p50 session duration (DASH-03)
const durations: number[] = [];
for (const row of sessions) {
    const d = new Date(row.last_activity || row.created_at).getTime() - new Date(row.created_at).getTime();
    if (d > 0 && d < 24 * 60 * 60 * 1000) durations.push(d);
}
durations.sort((a, b) => a - b);
const p50SessionDurationMs = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;

// Add to return object:
return {
    ...existingReturn,
    fieldStats: fieldDetailStats,   // NEW: DASH-05
    p50SessionDurationMs,            // NEW: DASH-03
};
```

### getTokenCostMetrics() — New Action (DASH-04)
```typescript
// Source: pattern consistent with existing actions.ts query style
export async function getTokenCostMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('llm_logs')
        .select('prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, conversation_id, created_at')
        .gte('created_at', since)
        .not('total_tokens', 'is', null);  // Only rows with token data (post-Phase3)

    if (error || !data || data.length === 0) {
        return { avgTokensPerConv: 0, totalTokens: 0, estimatedDailyCost: 0, logsWithTokens: 0, totalPromptTokens: 0, totalCompletionTokens: 0 };
    }

    const totalTokens = data.reduce((s: number, r: any) => s + (r.total_tokens || 0), 0);
    const totalPromptTokens = data.reduce((s: number, r: any) => s + (r.prompt_tokens || 0), 0);
    const totalCompletionTokens = data.reduce((s: number, r: any) => s + (r.completion_tokens || 0), 0);
    const totalCost = data.reduce((s: number, r: any) => s + (r.estimated_cost_usd || 0), 0);
    const uniqueConvs = new Set(data.map((r: any) => r.conversation_id)).size;
    const avgTokensPerConv = uniqueConvs > 0 ? Math.round(totalTokens / uniqueConvs) : 0;
    const dailyCost = days > 0 ? totalCost / days : 0;

    return { avgTokensPerConv, totalTokens, estimatedDailyCost: dailyCost, logsWithTokens: data.length, totalPromptTokens, totalCompletionTokens };
}
```

### getShadowMetrics() — New Action (SHADOW-02, SHADOW-03)
```typescript
export async function getShadowMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('shadow_logs')
        .select('agreed, current_state, shadow_proposal, created_at')
        .gte('created_at', since);

    if (error || !data || data.length === 0) {
        return { overall: 0, byDay: [] as Array<{ date: string; pct: number; total: number }>, totalLogs: 0, agreedCount: 0, hasData: false, isReady: false };
    }

    const agreedCount = data.filter((r: any) => r.agreed === true).length;
    const overallPct = Math.round((agreedCount / data.length) * 100);

    const byDayMap: Record<string, { total: number; agreed: number }> = {};
    for (const row of data) {
        const day = (row.created_at as string).substring(0, 10);
        if (!byDayMap[day]) byDayMap[day] = { total: 0, agreed: 0 };
        byDayMap[day].total++;
        if (row.agreed === true) byDayMap[day].agreed++;
    }
    const byDay = Object.entries(byDayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { total, agreed }]) => ({
            date,
            pct: total > 0 ? Math.round((agreed / total) * 100) : 0,
            total,
        }));

    const last7 = byDay.slice(-7);
    const isReady = last7.length >= 7 && last7.every(d => d.pct >= 95);

    return { overall: overallPct, byDay, totalLogs: data.length, agreedCount, hasData: true, isReady };
}
```

### checkAndWriteAlerts() — Alert Check Pattern (ALERT-01 to ALERT-04)
```typescript
// DAILY_TOKEN_BUDGET_USD defaults to 0 — Gemma is free, so cost alert never fires.
// Logic is present for when pricing is added or model switches.
const DAILY_TOKEN_BUDGET_USD = Number(process.env.DAILY_TOKEN_BUDGET_USD ?? '0');

export async function checkAndWriteAlerts() {
    const [errorMetrics, tokenMetrics, shadowMetrics] = await Promise.all([
        getErrorMetrics(1),      // last 24h
        getTokenCostMetrics(1),  // last 24h
        getShadowMetrics(7),     // last 7 days
    ]);

    const alertsToInsert: any[] = [];

    // ALERT-01: Fallback rate > 5%
    const fallbackRate = errorMetrics.total > 0 ? (errorMetrics.safetyNetTriggers / errorMetrics.total) * 100 : 0;
    if (fallbackRate > 5) alertsToInsert.push({ alert_type: 'fallback_rate', severity: 'warning', metric_value: fallbackRate, threshold: 5, message: `Fallback rate ${fallbackRate.toFixed(1)}% exceeds 5%` });

    // ALERT-02: LLM error rate > 1%
    const errorRate = errorMetrics.total > 0 ? (errorMetrics.errorIntents / errorMetrics.total) * 100 : 0;
    if (errorRate > 1) alertsToInsert.push({ alert_type: 'llm_error_rate', severity: 'critical', metric_value: errorRate, threshold: 1, message: `LLM error rate ${errorRate.toFixed(1)}% exceeds 1%` });

    // ALERT-03: Eval regression (uses existing getLatestEvalResults())
    try {
        const evalResults = await getLatestEvalResults();
        if (evalResults && typeof evalResults.overallScore === 'number' && evalResults.overallScore < 95) {
            alertsToInsert.push({ alert_type: 'eval_regression', severity: 'critical', metric_value: evalResults.overallScore, threshold: 95, message: `Eval score ${evalResults.overallScore}% below 95%` });
        }
    } catch { /* eval file read is non-fatal */ }

    // ALERT-04a: Daily cost exceeds budget (only fires if budget is set)
    if (DAILY_TOKEN_BUDGET_USD > 0 && tokenMetrics.estimatedDailyCost > DAILY_TOKEN_BUDGET_USD) {
        alertsToInsert.push({ alert_type: 'cost_anomaly', severity: 'warning', metric_value: tokenMetrics.estimatedDailyCost, threshold: DAILY_TOKEN_BUDGET_USD, message: `Daily cost $${tokenMetrics.estimatedDailyCost.toFixed(4)} exceeds budget` });
    }

    // ALERT-04b: Shadow alignment < 95% (only if enough data)
    if (shadowMetrics.hasData && shadowMetrics.totalLogs > 10 && shadowMetrics.overall < 95) {
        alertsToInsert.push({ alert_type: 'shadow_alignment', severity: 'warning', metric_value: shadowMetrics.overall, threshold: 95, message: `Shadow alignment ${shadowMetrics.overall}% below 95%` });
    }

    if (alertsToInsert.length > 0) {
        await supabase.from('system_alerts').insert(alertsToInsert);
    }
    return alertsToInsert;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `usage.promptTokens` | `usage.inputTokens` | AI SDK v6 (2024–2025) | Breaking: old code gets undefined silently |
| `usage.completionTokens` | `usage.outputTokens` | AI SDK v6 | Breaking: old code gets undefined silently |
| Plain unawaited Promise for post-response work | `after()` from `'next/server'` | Next.js 15.1 stable | Safer: function kept alive until async task completes on Vercel |
| Polling dashboard via useEffect only | `setInterval(fetchAll, 60000)` — already implemented | Existing code | No change needed |
| Shadow mode as separate deployment | Fire-and-forget async via `after()` in same route | Phase 3 decision | Zero latency impact on production path |

**Important version discrepancy to be aware of:**
- `CLAUDE.md` states "Tailwind CSS v3" but installed version is 4.2.1 (`tailwindcss: ^4.0.0` in package.json)
- Dashboard JSX uses standard Tailwind class names (bg-white, rounded-lg, etc.) which are identical in v3 and v4
- Do NOT use v3-specific `@tailwind base/components/utilities` directive patterns; follow existing page.tsx as reference for CSS patterns
- This discrepancy does NOT affect Phase 3 plans — follow existing dashboard JSX patterns

**Deprecated/outdated in this project's context:**
- `promptTokens`/`completionTokens` naming: replaced by `inputTokens`/`outputTokens` in AI SDK v6. Any requirement text saying "promptTokens, completionTokens" (e.g. COST-01 requirement) refers to DB column names. TypeScript code must use the new API names.

---

## Open Questions

1. **Rate limiter impact of classifier (RESOLVED — recommendation)**
   - What we know: `geminiRateLimiter.recordRequest()` is called for each LLM call; 30 RPM limit; 2 calls already per maid_hire turn (main LLM + extraction LLM)
   - Recommendation: Only run classifier when `currentState !== FlowState.START && currentState !== FlowState.COMPLETE`. This makes it ~6/8 states instead of 8/8. Call `geminiRateLimiter.recordRequest()` for the classifier call.

2. **Gemma pricing formula if model goes paid (RESOLVED — placeholder approach)**
   - What we know: `gemma-3-27b-it` is free as of 2026-02 per official Google AI pricing page
   - Recommendation: `const PER_1K_TOKENS = 0; const estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS;` — comment explains the placeholder. Easy to update when pricing changes.

3. **`after()` vs plain Promise for shadow handler (RESOLVED — use `after()`)**
   - What we know: `after()` is stable in Next.js 15.1+, project uses Next.js 16, import from `'next/server'`, works in Route Handlers. Confirmed from official docs (2026-02-28).
   - Recommendation: Use `after()` from `'next/server'`. This is the clean, supported approach. No need for `@vercel/functions`.

4. **Confusion counter storage location (RESOLVED — use `__confusion` key)**
   - What we know: `CollectedData` interface in `BaseFlow.ts` has `[key: string]: string | undefined` index signature confirmed from codebase read
   - Recommendation: Store as `collected_data.__confusion` — double-underscore prefix distinguishes from lead fields. No DB migration needed. MaidHiringFlow.ts does NOT need modification.

---

## Sources

### Primary (HIGH confidence)
- `https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text` — AI SDK v6 generateText usage object: `inputTokens`, `outputTokens`, `totalTokens` — confirmed 2026-02-28
- `https://nextjs.org/docs/app/api-reference/functions/after` — `after()` stable in Next.js 15.1+, available in Route Handlers, import from `'next/server'` — confirmed 2026-02-28
- `https://ai.google.dev/pricing` — Gemma 3 model pricing confirmed as free for input, output, context caching
- `src/lib/llm-logger.ts` (read from codebase 2026-02-28) — Current signature confirmed: `extractionMeta?` as optional param, no token params yet
- `src/app/api/chat/route.ts` (read from codebase 2026-02-28) — `generateText()` uses `const { text }` — `usage` NOT yet destructured. Two call sites: inside `handleMaidHireStateMachine()` (~line 323) and in non-maid-hire POST handler (~line 596)
- `src/app/dashboard/actions.ts` (read from codebase 2026-02-28) — `getProductHealthMetrics()` confirmed: returns `fieldFillRates` as percentages only, no `fieldStats` or `p50SessionDurationMs`. Four new functions NOT yet present.
- `src/app/dashboard/page.tsx` (read from codebase 2026-02-28) — `ProductHealth` interface NOT defined (line 138 references it), product_health tab render block missing, file ends line 916
- `src/flows/BaseFlow.ts` (read from codebase 2026-02-28) — `CollectedData` has `[key: string]: string | undefined` index signature — `__confusion` key permitted without migration
- `package.json` (read from codebase 2026-02-28) — `ai: ^6.0.41`, `next: ^16.1.6`, `tailwindcss: ^4.0.0` (actual installed: 4.2.1)

### Secondary (MEDIUM confidence)
- `https://vercel.com/blog/ai-sdk-6` — AI SDK v6 extended usage information confirmed; detailed breakdown structure documented

### Tertiary (LOW confidence)
- Tailwind CSS v4 vs v3 discrepancy: installed v4.2.1 but CLAUDE.md says v3. Practical impact: none for Phase 3 (existing class patterns work). Flag for project documentation cleanup.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries confirmed from package.json; no new installs; AI SDK usage object property names confirmed from official reference docs
- Architecture patterns: HIGH — All patterns derived from codebase reads (exact file content) and official docs
- Token property names: HIGH — Directly confirmed from official AI SDK reference docs (`inputTokens`/`outputTokens`) on 2026-02-28
- Gemma pricing: HIGH — Confirmed from official Google AI pricing page (free)
- `after()` API: HIGH — Confirmed stable in Next.js 15.1+, confirmed available in Route Handlers, correct import path from official Next.js docs (2026-02-28). Resolves previous LOW confidence.
- Pitfalls: HIGH — Derived from actual codebase inspection (ProductHealth interface missing, no tab render block, usage not destructured, etc.)
- Confusion counter storage: HIGH — `CollectedData` index signature confirmed from BaseFlow.ts read

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (30 days — stable stack; verify AI SDK usage object shape if upgrading beyond ^6.0.41)

**Changes from previous research (2026-02-27):**
1. `after()` open question resolved: HIGH confidence, confirmed in Next.js 16, `import { after } from 'next/server'`, stable since 15.1
2. All codebase claims re-verified against actual file reads (route.ts, llm-logger.ts, actions.ts, page.tsx, BaseFlow.ts)
3. Tailwind CSS version discrepancy identified: v4.2.1 installed, not v3 as CLAUDE.md states
4. All four open questions from previous research now resolved with recommendations
