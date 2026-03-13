---
phase: 01-llm-extraction-integration
plan: 01
subsystem: extractors
tags: [bug-fix, types, extraction, logging]
dependency_graph:
  requires: []
  provides: [ExtractionMeta, mergeWithConflictResolution, buildSourceMap, extractionMeta-logging]
  affects: [src/extractors/llmExtractor.ts, src/lib/llm-logger.ts]
tech_stack:
  added: []
  patterns: [conflict-resolution-merge, source-provenance-tracking]
key_files:
  created: []
  modified:
    - src/extractors/llmExtractor.ts
    - src/lib/llm-logger.ts
decisions:
  - "phone→regex wins in mergeWithConflictResolution (deterministic digit extraction more reliable than LLM)"
  - "LLM wins for all other fields (location, service_type, schedule, salary_range, family_size, has_experience)"
  - "extractionMeta is optional in logLLMInteraction so all existing callers remain unchanged"
  - "extraction_meta column in Supabase insert is safe to add before migration — handled in plan 02"
metrics:
  duration: "3m 7s"
  completed: "2026-02-27"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements_completed: [AGEX-01, AGEX-02, AGEX-03, AGEX-04]
---

# Phase 1 Plan 1: LLM Extractor Bug Fix and Extraction Contracts Summary

**One-liner:** Phone bug fixed (`/\D/g`), `ExtractionMeta` type + `mergeWithConflictResolution()` + `buildSourceMap()` added to llmExtractor.ts, `logLLMInteraction()` extended with optional extraction metadata logging.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix llmExtractor.ts — bug fix, ExtractionMeta type, conflict resolution functions | 63fef22 | src/extractors/llmExtractor.ts |
| 2 | Extend llm-logger.ts with optional extractionMeta param | b43d17e | src/lib/llm-logger.ts |

## What Was Built

### Task 1 — llmExtractor.ts

**Bug fix:** Line 45 `phone.replace(/D/g, '')` → `phone.replace(/\D/g, '')`. The original regex `/D/g` only stripped the literal letter "D". The fixed `/\D/g` strips all non-digit characters, correctly cleaning country codes like "+91 9876543210" down to "9876543210".

**New: `ExtractionMeta` interface (exported):**
```typescript
export interface ExtractionMeta {
  sources: {
    phone?: 'llm' | 'regex';
    location?: 'llm' | 'regex';
    // ... all 7 tracked fields
  };
  latency_ms: number;
  llm_raw: ExtractedSlots | null;
  fallback_triggered: boolean;
}
```

**New: `mergeWithConflictResolution()` (exported):** Implements trust hierarchy — phone always uses regex value when available (regex digit extraction is deterministic); all other fields keep LLM value when available and only fall back to regex when LLM is null.

**New: `buildSourceMap()` (exported):** Iterates all 7 tracked fields (skips `name`), returns `'llm'` or `'regex'` for each non-null field by comparing merged value to LLM value.

**Unchanged:** `mergeSlots()` — preserved for existing catch-block fallback usage.

### Task 2 — llm-logger.ts

- Added `import type { ExtractionMeta } from '../extractors/llmExtractor'`
- Added `extractionMeta?: ExtractionMeta` to `logLLMInteraction` data param (optional — all existing callers unchanged)
- Added `extraction_meta: data.extractionMeta ?? null` to Supabase insert object

## Decisions Made

1. **phone→regex wins:** Phone numbers extracted by regex (`/\d{10}/`) are deterministically correct — regex only returns 10-digit matches that pass `isValidPhone()`. LLM can hallucinate or mis-format phone numbers. When regex has a value, it overrides LLM.

2. **LLM wins for other fields:** Location (spelling correction), service_type (semantic mapping), schedule (intent understanding), salary_range (context-aware), family_size, has_experience — all benefit from LLM's natural language understanding. Regex fills nulls only.

3. **Optional param pattern:** `extractionMeta?` ensures zero breaking changes to existing call sites in `route.ts` and anywhere else that calls `logLLMInteraction()`.

4. **DB column timing:** Adding `extraction_meta` to the Supabase insert before the migration column exists is safe — the migration in plan 02 will add the column, and the maid_hire extraction path using this param won't be wired until plan 02.

## Deviations from Plan

### Out-of-scope Discovery (not fixed)

**Pre-existing TypeScript error in dashboard/page.tsx:** `ProductHealth` type is used at line 138 but never defined or imported. This error exists in the working tree modifications unrelated to this plan. Logged to `deferred-items.md`.

TypeScript compilation with my changes shows zero errors in the two modified files (`llmExtractor.ts`, `llm-logger.ts`). The only remaining error is the pre-existing `ProductHealth` issue in dashboard which was already present.

## Self-Check

Files exist:
- `src/extractors/llmExtractor.ts` — FOUND
- `src/lib/llm-logger.ts` — FOUND

Commits exist:
- `63fef22` — feat(01-01): fix phone bug, add ExtractionMeta type and conflict-resolution functions
- `b43d17e` — feat(01-01): extend logLLMInteraction with optional extractionMeta param

## Self-Check: PASSED
