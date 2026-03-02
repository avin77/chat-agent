---
status: resolved
trigger: "Audit and expand eval coverage for maid synonyms, misspelled intent words, dual-intent edge cases"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: detectIntent() is missing "servant", "naukrani", "khaana banana wali" and their Hinglish/typo variants — these route to 'general' instead of 'maid_hire'
test: Code inspection of detectIntent() regex patterns
expecting: Missing terms confirmed, then patched in route.ts + new c49-c52 test cases added
next_action: Apply fix to route.ts and state-golden-dataset.json

## Symptoms

expected: All natural ways to express "I need a maid" correctly route to maid_hire intent
actual: "servant" is NOT in detectIntent regex — may route to 'general' instead of 'maid_hire'
errors: No runtime errors — silent wrong routing
reproduction: Send "I need a servant" as first message — intent detected as 'general'
started: Always (never covered)

## Eliminated

- hypothesis: c19/c20 already cover intent-level spelling
  evidence: c19 tests "i nead a made for cookin" and c20 tests "hire made" — these are FIELD-level typos but intent was correctly caught by the existing "made" typo pattern. Intent-level synonym gaps remain.
  timestamp: 2026-03-02

## Evidence

- timestamp: 2026-03-02
  checked: detectIntent() in route.ts lines 80-111
  found: Regex covers maid/bai/kaam.?wali/cook/helper/housekeeper/cleaner/nanny/ayah — does NOT cover servant/naukrani/ghar ka kaam/khaana banana wali
  implication: These common Indian-English/Hinglish terms silently route to 'general'

- timestamp: 2026-03-02
  checked: "maed" typo coverage
  found: Existing pattern on line 102-103 covers "made" but NOT "maed" / "maeid" / "maaid"
  implication: Common keyboard-adjacent typos still miss intent

- timestamp: 2026-03-02
  checked: c19/c20 spelling test cases
  found: Both cover field-level typos (location spelling, service spelling) after intent is correctly routed. Neither tests intent-level synonym routing.
  implication: Gap confirmed — need c49-c52 for intent synonym + typo routing

## Resolution

root_cause: detectIntent() regex does not include servant/naukrani/Hinglish cooking phrases or maed/maeid typo variants
fix: Added servant|naukrani|ghar.?ka.?kaam|khaana.?bana to broader maid_hire pattern; added maed/maeid/maaid typo pattern; added Hinglish chahiye pattern for servant/naukrani
verification: eval:state passed 50/50 conversations (100%) — c49 servant ✅, c50 naukrani ✅, c51 khaana banana wali ✅, c52 maed typo ✅. No regressions on existing 46 conversations.
files_changed:
  - src/app/api/chat/route.ts
  - data/state-golden-dataset.json
