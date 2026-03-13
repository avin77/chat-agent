# RCA: Vercel Build Failures - March 13, 2026

**Commit:** `6a02a10`
**Date:** 2026-03-13
**Status:** RESOLVED

## Summary

Vercel build failed with multiple TypeScript and SDK compatibility errors after recent code changes. All issues were related to outdated or incorrect API usage with the `ai` SDK v6.0.41.

## Root Causes

### 1. Deprecated Streaming Response API
**Error:** `Export createDataStreamResponse doesn't exist in target module`

**Location:** `src/app/api/chat/route.ts:2`

**Root Cause:**
- The `ai` SDK v6 removed `createDataStreamResponse` export
- Code was using old API from earlier SDK versions
- Vercel build failed during module resolution phase

**Fix:**
- Removed import of non-existent `createDataStreamResponse`
- Added import of `streamText` (though later found simpler approach)
- Replaced deprecated API calls with standard JSON Response objects

**Changed:**
```typescript
// Before:
import { generateText, createDataStreamResponse } from 'ai';
return createDataStreamResponse({
  execute: (dataStream) => {
    dataStream.writeText(displayText);
    dataStream.writeData({ handledIntent: 'maid_hire', newState });
  },
});

// After:
import { generateText, streamText } from 'ai';
return new Response(
  JSON.stringify({
    message: displayText,
    handledIntent: 'maid_hire',
    newState,
  }),
  { headers: { 'Content-Type': 'application/json' } }
);
```

### 2. Removed UI Stream Helpers
**Error:** `Cannot find name 'createUIMessageStream'`

**Location:** `src/app/api/chat/route.ts:986`

**Root Cause:**
- `createUIMessageStream` and `createUIMessageStreamResponse` were custom helpers that never existed in `ai` SDK
- These were likely placeholder or experimental code
- No implementation found in codebase

**Fix:**
- Removed calls to non-existent functions
- Replaced with standard JSON Response (same fix as above)

### 3. Type Error: ResponseFieldSpec Array Indexing
**Error:** `Type 'ResponseFieldSpec' cannot be used as an index type`

**Location:** `src/app/dashboard/actions.ts:528`

**Root Cause:**
- `ResponseFieldSpec` is an object type with properties like `id`, `label`, `description`
- Code was treating array of `ResponseFieldSpec` objects as array of strings
- When iterating and using `f` as a record key, TypeScript rejected it (only strings/numbers allowed)

**Fix:**
- Changed all field access patterns to use `f.id` instead of `f`
- `f` = ResponseFieldSpec object, `f.id` = string field name

**Changed:**
```typescript
// Before:
for (const f of ALL_FIELDS) fieldCounts[f] = 0;
const hasAllRequired = REQUIRED_FIELDS.every(f => collected[f] && collected[f] !== 'skipped');

// After:
for (const f of ALL_FIELDS) fieldCounts[f.id] = 0;
const hasAllRequired = REQUIRED_FIELDS.every(f => collected[f.id] && collected[f.id] !== 'skipped');
```

**Affected Lines:**
- Line 528, 538, 541, 549, 577, 581-585, 601

### 4. Missing Database Column in Query
**Error:** `Property 'telemetry_meta' does not exist`

**Location:** `src/app/dashboard/actions.ts:923`

**Root Cause:**
- Code tried to access `log.telemetry_meta` from database query result
- The `.select()` clause didn't include `telemetry_meta` column
- Supabase returns only selected columns; accessing non-selected columns returns undefined

**Fix:**
- Added `telemetry_meta` to the select clause in `getAgenticQualityMetrics()`

**Changed:**
```typescript
// Before:
.select('conversation_id, raw_llm_response, after_guardrails, system_prompt, created_at')

// After:
.select('conversation_id, raw_llm_response, after_guardrails, system_prompt, created_at, telemetry_meta')
```

### 5. Missing Component Prop
**Error:** `Property 'shadowMetrics' is missing in type`

**Location:** `src/app/dashboard/page.tsx:1396`

**Root Cause:**
- `PreProdChecklist` component required `shadowMetrics` prop (part of component contract)
- Parent component `page.tsx` had `shadowMetrics` state but wasn't passing it
- TypeScript strict mode catches missing required props

**Fix:**
- Added `shadowMetrics={shadowMetrics}` to the component props

**Changed:**
```typescript
// Before:
<PreProdChecklist
  evalGovernance={evalGovernance}
  agenticQuality={agenticQuality}
/>

// After:
<PreProdChecklist
  evalGovernance={evalGovernance}
  agenticQuality={agenticQuality}
  shadowMetrics={shadowMetrics}
/>
```

### 6. Unsupported generateText Option
**Error:** `'responseFormat' does not exist in type 'CallSettings'`

**Location:** `src/lib/agentic/planner.ts:60`

**Root Cause:**
- Code used `responseFormat: { type: 'json' }` option in `generateText()`
- This option is not supported in `ai` SDK v6
- The system prompt already instructs the model to return JSON, so this option was redundant

**Fix:**
- Removed the `responseFormat` option completely
- JSON format is enforced through system prompt instructions

**Changed:**
```typescript
// Before:
const { text } = await generateText({
  model: this.model,
  system: PLANNER_SYSTEM_PROMPT + reflectionPrompt,
  messages: [...],
  responseFormat: { type: 'json' },
});

// After:
const { text } = await generateText({
  model: this.model,
  system: PLANNER_SYSTEM_PROMPT + reflectionPrompt,
  messages: [...],
});
```

## Prevention

**For Future Updates:**
1. **Test locally before pushing** - Run `npm run build` locally to catch type errors early
2. **SDK version management** - Lock `ai` SDK version or regularly review breaking changes
3. **Code review** - Catch deprecated API usage before merge
4. **Type safety** - Enable strict TypeScript to catch type mismatches at compile time

## Files Modified

| File | Changes | Reason |
|------|---------|--------|
| `src/app/api/chat/route.ts` | Import + 2 API calls | Remove deprecated streaming APIs |
| `src/app/dashboard/actions.ts` | 7 lines | Fix array field access + add DB column |
| `src/app/dashboard/page.tsx` | 1 line | Add missing component prop |
| `src/lib/agentic/planner.ts` | 1 line | Remove unsupported SDK option |

## Build Status

✅ **Vercel Build:** PASSING
✅ **TypeScript:** NO ERRORS
✅ **Deployment:** Auto-deployed after commit

## Related Issues

- None (no existing tracking tickets found)
