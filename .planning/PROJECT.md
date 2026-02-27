# EzyBot

## What This Is

AI-powered customer support chatbot for EzyHelpers.com. Handles maid hire leads, complaints, helper registrations, and general enquiries via a chat widget on the website. Currently migrating from a deterministic state machine to an LLM-first agentic architecture.

## Core Value

Capture quality domestic help leads (all 4 required fields: phone, location, service type, schedule) while maintaining natural, helpful conversation — even with misspellings, Hinglish input, or multi-attempt users.

## Requirements

### Validated

- ✓ Multi-intent detection (maid_hire, complaint, helper_reg, general) — existing
- ✓ 8-step deterministic maid hire state machine — existing
- ✓ Regex-based slot extraction (phone, location, service, schedule, salary, family, experience) — existing
- ✓ Session persistence in Supabase — existing
- ✓ LLM response generation via Gemini (gemma-3-27b-it) — existing
- ✓ Email escalation for qualified leads (Gmail SMTP + Resend fallback) — existing
- ✓ Guardrails: price blocking, phone validation, link removal — existing
- ✓ Dashboard with eval metrics, conversation health, LLM I/O — existing
- ✓ Golden dataset evaluation (39 conversations, 170 turns) — existing
- ✓ Location fuzzy matching with Levenshtein distance — done this cycle
- ✓ Session resume timeout (4h TTL reset, server + client) — done this cycle
- ✓ LLM slot extractor infrastructure (llmExtractor.ts with Zod schema) — done this cycle

### Active

- [ ] Integrate LLM extraction into chat route (with regex fallback)
- [ ] Agentic tool-calling flow behind USE_AGENTIC feature flag
- [ ] Token cost tracking in LLM logs (prompt/completion tokens, estimated USD)
- [ ] Product Health dashboard tab (slot fill rates, lead quality score, session duration, cost)
- [ ] Data flywheel mining scripts (missed extractions, golden from prod, guardrail analysis)

### Out of Scope

- Multi-intent Phase 3 agentic — needs 2+ weeks of Phase 2 production data first
- Mobile app — web-first, deferred
- Real-time analytics — batch queries only
- Playwright UI eval — already exists as separate test suite

## Context

Brownfield project with active production traffic (98% eval score as of Feb 24, 2026). The agentic upgrade is phased: Phase 1 (LLM extraction, lower risk) validates in production before Phase 2 (tool-calling flow, higher risk). Feature flags enable safe rollback. Data flywheel mines existing Supabase logs to improve extractors and eval dataset automatically without human review.

## Constraints

- **Runtime**: Node.js only (not Edge) — Nodemailer requires it; keep `runtime = 'nodejs'`
- **LLM**: Gemini `gemma-3-27b-it` via `@ai-sdk/google` — no model changes
- **Eval regression**: All changes must maintain ≥95% eval score on `data/state-golden-dataset.json`
- **Feature flag**: `USE_AGENTIC` env var required for agentic flow (safe rollback to deterministic)
- **DB schema changes**: Add new llm_logs columns (tokens, state, failure type) without breaking existing queries

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM extraction before tool-calling (phased) | Lower risk; validate intent extraction in prod before replacing full flow | — Pending |
| USE_AGENTIC env var feature flag | Production safety — one env change to roll back | — Pending |
| 4h session TTL reset | Short enough to continue mid-flow, long enough for fresh start next day | — Pending |
| Levenshtein threshold: floor(len/5) | 1 typo per 5 chars (e.g., "koramangala"=11 → allows distance ≤ 2) | — Pending |
| Flywheel scripts output to data/ (no auto DB writes) | Human review before any production changes | — Pending |

---
*Last updated: 2026-02-27 after initialization*
