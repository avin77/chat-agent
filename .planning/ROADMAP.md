# EzyBot Agentic Upgrade — Roadmap

**Project:** EzyBot
**Milestone:** v2.0 — Agentic Architecture
**Defined:** 2026-02-27
**Status:** Active

---

## Phase Overview

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | LLM Extraction Integration | Wire LLM-first extraction into chat route, ≥95% eval | AGEX-01–04 | COMPLETE |
| 2 | Agentic Tool-Calling Flow | handleMaidHireAgentic() behind USE_AGENTIC flag | FLOW-01–06 | COMPLETE |
| 3 | Dashboard & Cost Tracking | Product Health tab with token cost, shadow, alerts | COST-01–03, DASH-01–05, SHADOW-02–04, CONV-01–04, ALERT-01–04 | COMPLETE |
| 4 | Data Flywheel Scripts | Automated mining scripts to self-improve extractors and eval | FLY-01–04 | Pending |

---

## Phase 1: LLM Extraction Integration

**Goal:** Wire `llmExtractor.ts` into the chat route so the LLM handles slot extraction first, with regex as a reliable fallback. Eval score must remain ≥95%.

**Requirements:** AGEX-01, AGEX-02, AGEX-03, AGEX-04

**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Fix llmExtractor bug + add ExtractionMeta type and conflict resolution functions + extend llm-logger (commits: 63fef22, b43d17e)
- [x] 01-02-PLAN.md — Supabase migration + wire LLM extraction into route.ts + eval verification (commit: b1f77e7)

**Files:**
- `src/app/api/chat/route.ts` — Replace `extractAllSlots()` call with `extractAllSlotsWithLLM()`, add try/catch for regex fallback
- `src/extractors/llmExtractor.ts` — Already created; may need refinements
- `src/extractors/dataExtractor.ts` — Regex extractors kept as fallback, no removal

**Success Criteria:**
1. User types "Koramanagla Bengaluru, I need a cook" → bot advances to ASK_SERVICE in one turn (location extracted by LLM despite misspelling)
2. When Gemini API is unavailable, chat still works (regex fallback activates silently)
3. `npm run eval:state` passes ≥95% — no regressions on c01–c41
4. Hinglish input ("mujhe maid chahiye Koramangala mein") extracts location correctly

---

## Phase 2: Agentic Tool-Calling Flow

**Goal:** Build `handleMaidHireAgentic()` with LLM tool-calling to replace the deterministic state machine, behind a `USE_AGENTIC` feature flag for safe rollback.

**Requirements:** FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06

**Plans:** 3/3 plans complete

Plans:
- [x] 02-01-PLAN.md — Create agenticMaidHire.ts: 8 tool definitions + handleMaidHireAgentic() with force-escalate, loop detection, guardrails (commit: deecb40)
- [x] 02-02-PLAN.md — Supabase migration SQL + USE_AGENTIC routing in route.ts + agentic leads insert (commits: 7ae043e, 64c7cad)
- [x] 02-03-PLAN.md — Human verify: migration applied, eval 100% PRODUCTION READY (50 convos, 192 turns) with USE_AGENTIC=true (2026-03-02)

**Files:**
- `src/flows/agenticMaidHire.ts` — New file: tool definitions + agentic handler
- `src/app/api/chat/route.ts` — Feature flag routing (USE_AGENTIC → agentic handler, else deterministic)
- `supabase-migration-phase2.sql` — New: adds agentic_mode column to conversation_sessions

**Success Criteria:**
1. `USE_AGENTIC=true` in `.env.local` → maid hire flow uses tool-calling handler
2. `USE_AGENTIC=false` (or unset) → deterministic handler works identically to before
3. Session saved to Supabase correctly after each tool call (same schema)
4. Force-escalate fires after 3 consecutive failed tool calls
5. All 7 fields collected in correct order; escalation email sent on completion
6. `npm run eval:state` passes ≥95% with USE_AGENTIC=true

---

## Phase 3: Dashboard & Cost Tracking

**Goal:** Complete the Product Health dashboard tab with lead funnel metrics, slot fill rates, token cost tracking, shadow mode alignment infrastructure, conversation robustness, and alert thresholds.

**Requirements:** COST-01, COST-02, COST-03, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, SHADOW-01, SHADOW-02, SHADOW-03, SHADOW-04, CONV-01, CONV-02, CONV-03, CONV-04, ALERT-01, ALERT-02, ALERT-03, ALERT-04

**Plans:** 5/5 plans complete

Plans:
- [x] 03-01-PLAN.md — Supabase migration: 4 token columns on llm_logs + shadow_logs table + system_alerts table (commit: 48e512d)
- [x] 03-02-PLAN.md — Extend llm-logger with token params + capture token usage from generateText() in route.ts (commits: 80249f9, 497d2ed, b62cae7)
- [x] 03-03-PLAN.md — Intent classifier (intentClassifier.ts) + shadow handler (shadowHandler.ts) + confusion counter + wire into route.ts (commits: 7dd3435, 087dbeb)
- [x] 03-04-PLAN.md — Dashboard Product Health tab UI + new server actions (token cost, shadow metrics, system alerts) (commits: b424b5c, d1026e9)
- [x] 03-05-PLAN.md — Human verify: Supabase migration applied, token logging confirmed, Product Health tab operational (human-approved 2026-02-28)

**Files:**
- `supabase-migration-phase3.sql` — New: all Phase 3 schema changes (idempotent)
- `src/lib/llm-logger.ts` — Add promptTokens, completionTokens, totalTokens, estimatedCostUsd params
- `src/app/api/chat/route.ts` — Capture usage from generateText(), integrate classifier, shadow fire-and-forget
- `src/app/dashboard/actions.ts` — Extend getProductHealthMetrics() + add getTokenCostMetrics(), getShadowMetrics(), getSystemAlerts(), checkAndWriteAlerts()
- `src/app/dashboard/page.tsx` — Add Product Health tab content (KPI cards, slot fill rates, token cost, shadow panel, alerts)
- `src/extractors/intentClassifier.ts` — New: lightweight LLM message classification
- `src/lib/shadowHandler.ts` — New: async shadow comparison against production decisions
- `src/flows/BaseFlow.ts` — Add __confusion comment (no structural change needed)

**Success Criteria:**
1. `/dashboard` → Product Health tab shows data (not empty)
2. Lead completion rate, lead quality score, effective escalation rate displayed with real numbers
3. Slot fill rate shows all 7 fields with filled/skipped/total counts
4. After one chat conversation, a new llm_logs row has non-null token columns
5. Session duration card shows avg + p50 session time for maid_hire conversations
6. Shadow panel shows alignment % (or "no data yet" if no conversations run)
7. After 2 consecutive off-topic messages, bot offers to restart or connect to support
8. eval score remains ≥95% after Phase 3 changes

---

## Phase 4: Data Flywheel Scripts

**Goal:** Automated scripts to mine production Supabase data for improving extractors, prompts, and the eval dataset — no human review required to run.

**Requirements:** FLY-01, FLY-02, FLY-03, FLY-04

**Files:**
- `scripts/mine-missed-extractions.js` — New: query stuck-then-recovered sessions
- `scripts/mine-golden-from-prod.js` — New: reconstruct COMPLETE sessions as golden test cases
- `scripts/analyze-guardrail-mods.js` — New: rank states by guardrail trigger rate
- `package.json` — Add `"mine"` script

**Success Criteria:**
1. `npm run mine` runs without errors (even if Supabase has few records)
2. `data/missed-extractions-*.json` created with format: `{ state, rejected_text, accepted_text }`
3. `data/mined-golden-*.json` created with phone numbers hashed (no real PII)
4. `scripts/analyze-guardrail-mods.js` outputs states ranked by guardrail trigger rate
5. All three scripts handle empty result sets gracefully (no crash, just empty output)

---

## Deferred (v3)

- **Multi-intent agentic** — Single LLM orchestrator for complaint + hire + helper_reg in one session
- **LLM-generated error messages** — Replace hardcoded `errorMessage` with contextual LLM responses
- **Cron scheduling** for flywheel scripts
- **Supabase real-time** analytics dashboard

---
*Roadmap created: 2026-02-27*
*Last updated: 2026-03-02 — Phases 1, 2, 3 COMPLETE. Eval: 100% PRODUCTION READY (USE_AGENTIC=true). Phase 4 deferred to v3.0.*
