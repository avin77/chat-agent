# Deferred Items — Phase 01 LLM Extraction Integration

## Out-of-scope discoveries (pre-existing issues, not caused by plan 01-01)

### 1. Missing ProductHealth type in dashboard/page.tsx

**Found during:** Task 1 verification (TypeScript compilation)
**File:** `src/app/dashboard/page.tsx` line 138
**Issue:** `ProductHealth` type is referenced but never imported or defined. The type is used for `useState<ProductHealth | null>`. The function `getProductHealthMetrics` is imported from `actions.ts` but its return type is not exported as a named interface.
**Status:** Pre-existing in working tree modifications — not caused by plan 01-01 changes
**Suggested fix:** Export `ProductHealth` type from `src/app/dashboard/actions.ts` or define it in `page.tsx`
