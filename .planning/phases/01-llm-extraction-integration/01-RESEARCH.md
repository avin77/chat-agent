# Phase 1: LLM Extraction Integration - Research

**Researched:** 2026-02-27
**Domain:** LLM-based structured slot extraction with regex fallback, Vercel AI SDK `generateObject`, Supabase schema migration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fallback trigger conditions:**
- Fallback is field-by-field: if LLM returns null for `location` but non-null for `service_type`, regex only runs for location — LLM's service_type value is kept
- If Gemini API throws an error (quota, timeout, 500): silent fallback to full regex extraction, error logged server-side, user sees no difference
- LLM extraction runs on every turn in every state — no state-specific skipping

**Field conflict resolution (when both LLM and regex return non-null):**
- Phone: regex always wins — regex is 100% reliable for 10-digit format (starts 6–9). LLM only fills phone if regex returned null.
- Location, service_type, schedule, salary_range, family_size, has_experience: LLM wins on conflict (better at fuzzy/Hinglish/ambiguous input)
- Both values (LLM raw + which source won) are stored in `extraction_meta` for later dashboard visibility

**Latency & timeout:**
- Hard timeout: 10 seconds on the LLM extraction call (accounts for free Gemini 27B rate limits — 30 conv/min)
- After 10s timeout: cancel LLM call, run full regex extraction, continue silently
- Typing indicator in chat stays on until full response arrives — no additional UX change
- `extraction_latency_ms` logged separately from `took_ms` (full response time) to isolate extraction cost

**Extraction logging (new `extraction_meta` JSONB column in `llm_logs`):**
- Schema: `{ sources: { phone: 'regex'|'llm', location: 'regex'|'llm', ... }, latency_ms: number, llm_raw: {...all 7 fields as LLM returned them...}, fallback_triggered: boolean }`
- Single Supabase migration: `ALTER TABLE llm_logs ADD COLUMN extraction_meta jsonb`
- `logLLMInteraction()` in `llm-logger.ts` gets new optional param `extractionMeta`
- Dashboard display of this data is Phase 3 — Phase 1 only populates the column

**Claude's Discretion:**
- Exact error logging format for API failures (console.error is fine)
- Whether to use `Promise.race()` or `AbortController` for the 10s timeout
- How to structure the try/catch/fallback in route.ts

### Deferred Ideas (OUT OF SCOPE)

- Unrecognized intents jumping states — this becomes relevant in Phase 2 (tool-calling flow)
- Dashboard rendering of extraction_meta — Phase 3
- Per-state LLM compliance rate tracking — Phase 3 / Data Flywheel
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGEX-01 | `extractAllSlotsWithLLM()` from `llmExtractor.ts` called first in chat route before regex extractors | Wire call at line 246 of route.ts inside `handleMaidHireStateMachine()`, replacing the bare `extractAllSlots()` call |
| AGEX-02 | Regex extractors run as fallback for any field where LLM returned null | `mergeSlots()` already exists in llmExtractor.ts — use it after calling `extractAllSlots()` per-field for nulls |
| AGEX-03 | LLM extraction API errors (timeout, quota) fall back to regex gracefully — no user-visible failure | try/catch + Promise.race/AbortController pattern; existing catch in llmExtractor.ts already calls `extractAllSlots()` but needs timeout wrapper |
| AGEX-04 | Eval score ≥95% after integration (run `npm run eval:state` to verify) | `npm run eval:state` runs `scripts/eval-state-machine.js --json` against localhost:3000 — must start dev server first |
</phase_requirements>

---

## Summary

Phase 1 is a focused surgical integration: replace the single `extractAllSlots(latestMessage)` call in `handleMaidHireStateMachine()` (route.ts line 246) with the LLM-first path, then wire in field-by-field merge logic and per-field conflict resolution. The infrastructure already exists — `llmExtractor.ts` has `extractAllSlotsWithLLM()` and `mergeSlots()`, `dataExtractor.ts` has all regex extractors, and `llm-logger.ts` handles Supabase writes.

There is one pre-existing bug in `llmExtractor.ts` that MUST be fixed as part of this phase: line 45 has `phone.replace(/D/g, '')` which should be `phone.replace(/\D/g, '')`. The unescaped regex only strips literal 'D' characters instead of all non-digit characters, meaning phone numbers like "+91 9876543210" would not be cleaned correctly before validation.

The conflict resolution rule (phone→regex wins, all others→LLM wins) must be implemented as an explicit merge function (not inside `mergeSlots()` which is pure null-fill). The `extraction_meta` JSONB column must be added to `llm_logs` via a Supabase SQL migration and `logLLMInteraction()` must accept it as an optional parameter.

**Primary recommendation:** Integrate by wrapping `extractAllSlotsWithLLM()` in a `Promise.race()` with a 10-second timeout inside `handleMaidHireStateMachine()`. Use a dedicated `mergeWithConflictResolution()` function that applies the phone-wins-regex / others-win-LLM rules cleanly, then pass `extraction_meta` through to logging.

---

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | ^6.0.41 | `generateObject()` for structured LLM extraction | Already used in project; `generateObject` with Zod schema guarantees typed output |
| `@ai-sdk/google` | ^3.0.10 | Gemini provider for Vercel AI SDK | Already used; `google('gemma-3-27b-it')` is the established model |
| `zod` | ^3.24.1 | Schema validation for LLM output | Already used in llmExtractor.ts slotsSchema |
| `@supabase/supabase-js` | ^2.90.1 | JSONB column migration + insert | Already used in llm-logger.ts |

### No new packages needed

All dependencies are already installed. This phase is integration-only.

**Installation:**
```bash
# No new packages — all dependencies already present
```

---

## Architecture Patterns

### Current Call Site (to be modified)

```
handleMaidHireStateMachine() in route.ts
  line 246: const extractedSlots = extractAllSlots(latestMessage);  ← REPLACE THIS
  line 254-263: maidHiringFlow.processMessage(..., extractedSlots, ...)
```

### Recommended Project Structure (no changes to file layout)

```
src/
├── extractors/
│   ├── llmExtractor.ts   # extractAllSlotsWithLLM(), mergeSlots() — MODIFY (bug fix + extraction_meta)
│   └── dataExtractor.ts  # extractAllSlots() and per-field functions — READ ONLY
├── app/api/chat/
│   └── route.ts          # handleMaidHireStateMachine() — MODIFY extraction call + logging
└── lib/
    └── llm-logger.ts     # logLLMInteraction() — ADD extractionMeta optional param
```

### Pattern 1: LLM-first with Field-by-Field Fallback

**What:** Call LLM extractor first. For each field, if LLM returned null, substitute regex result. For phone, always prefer regex over LLM.

**When to use:** Every turn in maid_hire state machine (no state-specific skipping per locked decisions).

**Example:**
```typescript
// In handleMaidHireStateMachine(), replacing line 246

const extractionStart = Date.now();
let extractedSlots: ExtractedSlots;
let extractionMeta: ExtractionMeta;

try {
  // 10-second timeout via Promise.race
  const llmPromise = extractAllSlotsWithLLM(latestMessage);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM extraction timeout')), 10_000)
  );

  const llmSlots = await Promise.race([llmPromise, timeoutPromise]);
  const regexSlots = extractAllSlots(latestMessage);
  const latencyMs = Date.now() - extractionStart;

  // Apply conflict resolution: phone→regex wins, others→LLM wins
  extractedSlots = mergeWithConflictResolution(llmSlots, regexSlots);

  extractionMeta = {
    sources: buildSourceMap(llmSlots, regexSlots, extractedSlots),
    latency_ms: latencyMs,
    llm_raw: llmSlots,
    fallback_triggered: false,
  };
} catch (err) {
  console.error('[LLM Extraction] Fallback triggered:', (err as Error).message);
  extractedSlots = extractAllSlots(latestMessage);
  extractionMeta = {
    sources: buildAllRegexSourceMap(extractedSlots),
    latency_ms: Date.now() - extractionStart,
    llm_raw: null,
    fallback_triggered: true,
  };
}
```

### Pattern 2: Conflict Resolution via Config Object

**What:** Express the phone-wins-regex / others-win-LLM rule as a declarative config array, not scattered if/else.

**Example:**
```typescript
// In llmExtractor.ts or route.ts

const REGEX_WINS_FIELDS = ['phone'] as const;
const LLM_WINS_FIELDS = [
  'location', 'service_type', 'schedule',
  'salary_range', 'family_size', 'has_experience'
] as const;

export function mergeWithConflictResolution(
  llmSlots: ExtractedSlots,
  regexSlots: ExtractedSlots
): ExtractedSlots {
  const result = { ...llmSlots };

  // Phone: regex always wins
  for (const field of REGEX_WINS_FIELDS) {
    if (regexSlots[field] !== null) {
      result[field] = regexSlots[field];
    }
    // If regex is null, LLM result stands (may also be null — that's correct)
  }

  // Other fields: LLM wins on conflict, regex fills nulls
  for (const field of LLM_WINS_FIELDS) {
    if (result[field] === null && regexSlots[field] !== null) {
      result[field] = regexSlots[field];
    }
    // If LLM non-null, keep LLM result (even if regex has different value)
  }

  return result;
}
```

### Pattern 3: extraction_meta Logging via Optional Param

**What:** Extend `logLLMInteraction()` signature with an optional `extractionMeta` param. Only maid_hire calls pass it.

**Example:**
```typescript
// llm-logger.ts — MODIFIED signature
export async function logLLMInteraction(data: {
    conversationId: string;
    intent: string;
    systemPrompt: string;
    userMessage: string;
    fullHistory: any[];
    rawResponse: string;
    cleanedResponse: string;
    tookMs: number;
    extractionMeta?: ExtractionMeta;   // NEW — optional
}) {
    await supabase.from('llm_logs').insert({
        // ... existing fields ...
        extraction_meta: data.extractionMeta ?? null,   // NEW
    });
}
```

### Pattern 4: Supabase JSONB Column Migration

**What:** Add `extraction_meta` column to `llm_logs` via raw SQL. No ORM migration system — execute directly in Supabase dashboard or via supabase-js RPC.

**Example:**
```sql
-- Run in Supabase SQL editor
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS extraction_meta jsonb;
```

### Anti-Patterns to Avoid

- **Modifying mergeSlots() for conflict resolution:** `mergeSlots()` is a pure null-fill function. Do not add conflict logic to it — create a separate `mergeWithConflictResolution()` that runs after.
- **Running LLM extraction outside maid_hire:** The LLM extraction call is expensive and only relevant to the state machine. Other intents (complaint, helper_reg, general) use the existing LLM flow — do not touch them.
- **Swallowing extraction latency in tookMs:** The 10s extraction happens before the main LLM call. Log `extraction_latency_ms` separately in `extraction_meta` so dashboard (Phase 3) can isolate it.
- **Removing `mergeSlots()` from llmExtractor.ts:** The existing `mergeSlots()` function may be referenced elsewhere. Keep it, add the new function alongside it.
- **Not fixing the `/D/g` bug:** The existing `phone.replace(/D/g, '')` regex is broken. It must be corrected to `phone.replace(/\D/g, '')` as part of this phase — otherwise phone validation in llmExtractor is silently broken.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parsing from prompt | `generateObject()` with Zod schema | Already in llmExtractor.ts; Zod schema guarantees type safety, auto-retries malformed output |
| Timeout on async call | Manual setTimeout + flag | `Promise.race()` with reject | Clean cancellation, standard pattern, works with existing async/await in route.ts |
| Phone number cleaning | Custom digit-stripping logic | `isValidPhone()` from dataExtractor.ts | Already exported and tested; reuse directly |
| JSONB schema enforcement | Application-level validation | Supabase `jsonb` column type | Supabase stores whatever JSON is passed; Phase 3 dashboard reads it — no enforcement needed now |

**Key insight:** The extraction infrastructure (Zod schema, LLM call, regex fallbacks) is already built. Phase 1 is wiring, not building. The only net-new code is `mergeWithConflictResolution()`, the timeout wrapper, and the `extraction_meta` logging shape.

---

## Common Pitfalls

### Pitfall 1: Bug in llmExtractor.ts Phone Cleaning
**What goes wrong:** `phone.replace(/D/g, '')` only removes the letter 'D', not non-digit characters. An LLM-returned phone like "+91 9876543210" becomes "91 9876543210" (spaces preserved), then `.slice(-10)` gets "876543210" (9 digits), which fails `isValidPhone()` → phone is null → regex fallback for phone.
**Why it happens:** Regex escape character `\D` was written as `D` — a typo that TypeScript does not catch.
**How to avoid:** Fix on line 45 to `/\D/g`. Run test: `"9876543210".replace(/\D/g, '')` → "9876543210" (correct).
**Warning signs:** Eval failures on phone extraction test cases where LLM extraction is primary.

### Pitfall 2: Double LLM Call Latency
**What goes wrong:** Phase 1 adds an LLM extraction call (up to 10s) before the existing main LLM call (for generating the response). Worst case: 10s extraction + 10s response = 20s total, hitting Next.js route `maxDuration = 30`.
**Why it happens:** Two sequential Gemini API calls per turn.
**How to avoid:** The extraction timeout is 10s, main LLM is typically 2-5s. At Gemini 27B free tier with 30 RPM, these run sequentially (same rate limiter). Total stays under 30s in practice. Log both `extraction_latency_ms` and `took_ms` (which includes everything) to monitor.
**Warning signs:** HTTP 504 or Vercel function timeout errors in production logs.

### Pitfall 3: Rate Limiter Double-Counting
**What goes wrong:** `geminiRateLimiter.recordRequest()` is called once in the POST handler (line 415) before `handleMaidHireStateMachine()`. But `extractAllSlotsWithLLM()` makes a second Gemini call. The rate limiter only tracks 1 call, but 2 are made.
**Why it happens:** Rate limiter is invoked at route entry for the main LLM call, not per-call.
**How to avoid:** Either call `geminiRateLimiter.recordRequest()` again before the extraction LLM call, or accept that the rate limiter under-counts for maid_hire (30 RPM limit means ~15 maid_hire conversations per minute if each makes 2 calls). For Phase 1, the simpler approach is to call `geminiRateLimiter.recordRequest()` before `extractAllSlotsWithLLM()`.
**Warning signs:** Gemini 429 errors more frequent than expected given traffic.

### Pitfall 4: `extraction_meta` Column Not Existing Yet
**What goes wrong:** `logLLMInteraction()` tries to insert into `extraction_meta` column before migration runs — Supabase silently ignores unknown columns OR throws an error depending on RLS/schema strictness.
**Why it happens:** Database migration must run before code deploy.
**How to avoid:** Migration task must be Wave 0 (first task in Phase 1 plan). The `ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS extraction_meta jsonb` is idempotent — safe to run multiple times.
**Warning signs:** LLM logs missing `extraction_meta` data after deploy despite code change.

### Pitfall 5: TypeScript ExtractionMeta Type Missing
**What goes wrong:** `extraction_meta` shape is used in route.ts, llmExtractor.ts, and llm-logger.ts but defined nowhere — causing TypeScript compilation errors.
**Why it happens:** New shared type not added to a shared types file.
**How to avoid:** Define `ExtractionMeta` interface in `llmExtractor.ts` and export it. Import in route.ts and llm-logger.ts.
**Warning signs:** `npm run build` fails with "Cannot find name 'ExtractionMeta'".

### Pitfall 6: `mergeSlots()` Confusion
**What goes wrong:** Developer uses existing `mergeSlots()` (null-fill only) instead of new `mergeWithConflictResolution()` (phone→regex, others→LLM), missing the conflict resolution requirement.
**Why it happens:** `mergeSlots()` already exists and looks like what's needed.
**How to avoid:** Keep `mergeSlots()` for backward compatibility; add `mergeWithConflictResolution()` as a distinct function with a clear docstring explaining the difference.
**Warning signs:** Phone numbers extracted by LLM (which may be malformatted) getting accepted when regex had the correct value.

---

## Code Examples

Verified patterns from actual codebase inspection:

### Current extraction call in route.ts (line 246) — to be replaced
```typescript
// CURRENT — route.ts line 246 (inside handleMaidHireStateMachine)
const extractedSlots = extractAllSlots(latestMessage);
```

### ExtractionMeta type to define in llmExtractor.ts
```typescript
// Add to src/extractors/llmExtractor.ts

export interface ExtractionMeta {
  sources: {
    phone?: 'llm' | 'regex';
    location?: 'llm' | 'regex';
    service_type?: 'llm' | 'regex';
    schedule?: 'llm' | 'regex';
    salary_range?: 'llm' | 'regex';
    family_size?: 'llm' | 'regex';
    has_experience?: 'llm' | 'regex';
  };
  latency_ms: number;
  llm_raw: ExtractedSlots | null;  // what LLM returned before merge
  fallback_triggered: boolean;
}
```

### Bug fix in llmExtractor.ts line 45
```typescript
// CURRENT (broken): phone.replace(/D/g, '').slice(-10)
// FIXED:
const cleaned = phone.replace(/\D/g, '').slice(-10);
```

### Promise.race timeout pattern
```typescript
// Standard pattern — no AbortController needed for this use case
const llmPromise = extractAllSlotsWithLLM(latestMessage);
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('LLM extraction timeout after 10s')), 10_000)
);
const llmSlots = await Promise.race([llmPromise, timeoutPromise]);
```

### Source map builder
```typescript
function buildSourceMap(
  llmSlots: ExtractedSlots,
  regexSlots: ExtractedSlots,
  merged: ExtractedSlots
): ExtractionMeta['sources'] {
  const fields = ['phone', 'location', 'service_type', 'schedule', 'salary_range', 'family_size', 'has_experience'] as const;
  const sources: ExtractionMeta['sources'] = {};
  for (const field of fields) {
    if (merged[field] !== null) {
      sources[field] = merged[field] === llmSlots[field] ? 'llm' : 'regex';
    }
  }
  return sources;
}
```

### Supabase migration SQL
```sql
-- Run once in Supabase SQL Editor before deploying code
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS extraction_meta jsonb;
```

### logLLMInteraction call from maid_hire path
```typescript
// In route.ts, the maid_hire logLLMInteraction call (around line 447)
await logLLMInteraction({
    conversationId,
    intent: 'maid_hire',
    systemPrompt,
    userMessage: latestMessage,
    fullHistory: trimMessages(coreMessages),
    rawResponse,
    cleanedResponse: displayText,
    tookMs,
    extractionMeta,   // NEW — pass through from handleMaidHireStateMachine return
});
```

### handleMaidHireStateMachine return type extension
```typescript
// Extend the return type to pass extraction_meta up to the POST handler
async function handleMaidHireStateMachine(...): Promise<{
  displayText: string;
  shouldEscalate: boolean;
  collectedData: Record<string, any>;
  tookMs: number;
  systemPrompt: string;
  rawResponse: string;
  extractionMeta: ExtractionMeta;   // NEW
}>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `extractAllSlots()` (regex-only) | `extractAllSlotsWithLLM()` + regex fallback | Phase 1 (now) | LLM handles misspellings, Hinglish, ambiguous input that regex misses |
| `generateObject()` with no timeout | `Promise.race()` with 10s timeout | Phase 1 (now) | Silent fallback prevents user-visible failures on Gemini rate limit |
| `logLLMInteraction()` without extraction source | `logLLMInteraction()` with `extraction_meta` | Phase 1 (now) | Enables Phase 3 dashboard to show LLM vs regex win rates per field |

**Deprecated/outdated:**
- `mergeSlots()` in llmExtractor.ts: Still valid for null-fill but must not be used for conflict resolution. The new `mergeWithConflictResolution()` replaces it at the call site.

---

## Open Questions

1. **Rate limiter strategy for double-call**
   - What we know: `geminiRateLimiter.recordRequest()` is called once per POST. Phase 1 adds a second Gemini call for extraction.
   - What's unclear: Should we call `recordRequest()` again before extraction, or accept under-counting?
   - Recommendation: Call `recordRequest()` once more before `extractAllSlotsWithLLM()` to accurately track usage. The free tier 30 RPM limit effectively becomes ~15 full maid_hire conversations per minute — acceptable for current traffic.

2. **`name` field in LLM extraction**
   - What we know: `llmExtractor.ts` returns `name: null` always (comment says "name not needed for state machine"). `dataExtractor.ts` has `extractName()`.
   - What's unclear: Should `extraction_meta.sources` track `name` field?
   - Recommendation: Exclude `name` from `extraction_meta.sources` since LLM never extracts it. Keep `ExtractedSlots.name` as null from LLM, regex fill applies as normal.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src/extractors/llmExtractor.ts` — full file read, confirmed bug on line 45
- Direct code inspection of `src/extractors/dataExtractor.ts` — full file, all 7 slot extractors verified
- Direct code inspection of `src/app/api/chat/route.ts` — full file, exact integration point at line 246 confirmed
- Direct code inspection of `src/lib/llm-logger.ts` — current signature, Supabase insert fields verified
- Direct code inspection of `.planning/phases/01-llm-extraction-integration/01-CONTEXT.md` — locked decisions
- `package.json` — verified all dependencies present, no new installs needed

### Secondary (MEDIUM confidence)
- `npm run eval:state` confirmed as `node scripts/eval-state-machine.js --json` — runs against localhost:3000
- `scripts/eval-state-machine.js` reviewed — confirms it calls real bot HTTP endpoint (requires dev server running)

### Tertiary (LOW confidence)
- None — all research sourced from actual project files

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, versions confirmed from package.json
- Architecture: HIGH — integration point confirmed from direct code inspection at route.ts line 246
- Pitfalls: HIGH — bug in llmExtractor.ts line 45 verified by direct inspection; other pitfalls derived from code structure analysis
- Extraction logic: HIGH — mergeSlots() and slotsSchema confirmed from llmExtractor.ts

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable — no fast-moving dependencies involved)
