# Synonym Recovery Flywheel

Phase 11 turns repeated misses into a standard loop:

1. Mine misses.
   - `npm run mine:misses`
   - `npm run mine:golden`
   - `npm run mine:guardrails`
2. Review the failure cluster.
   - `npm run eval:failures`
   - Use `--category synonym_hinglish_service` or `--conv c56` for focused triage.
3. Land the fix in the shared knowledge layer.
   - Service vocabulary: [`src/lib/serviceVocabulary.ts`](/C:/Coding/EzyBot/ezybot/src/lib/serviceVocabulary.ts)
   - Extractor integration: [`src/extractors/dataExtractor.ts`](/C:/Coding/EzyBot/ezybot/src/extractors/dataExtractor.ts)
   - Prompt/playbook alignment: [`src/lib/prompts-enhanced.ts`](/C:/Coding/EzyBot/ezybot/src/lib/prompts-enhanced.ts), [`src/lib/responsePlaybooks.ts`](/C:/Coding/EzyBot/ezybot/src/lib/responsePlaybooks.ts)
4. Add or update regression cases.
   - `data/unhappy-golden-dataset.json`
   - `data/state-golden-dataset.json`
5. Re-run evals and governance.
   - `npm run eval:state`
   - `npm run eval:unhappy`
   - `npm run eval:governance`

## Initial Target

- Blocker conversation: `c56`
- Blocker category: `synonym_hinglish_service`

## Rules

- Do not ship synonym fixes only in prompts.
- Do not write raw PII into mined artifacts.
- Every accepted miss class needs a regression case before it is considered closed.
