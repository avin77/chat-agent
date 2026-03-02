---
status: resolved
trigger: "Fix regression in agentic-score-improvements: happy_path dropped from 50% to 33% after the pre-extraction fix. Overall score is 94% — target is ≥95%."
created: 2026-03-02T00:00:00.000Z
updated: 2026-03-02T05:15:00.000Z
---

## Current Focus

hypothesis: RESOLVED — all 3 bugs identified and fixed (or confirmed already fixed)
test: Full eval run — 100% overall score achieved
expecting: N/A
next_action: DONE — archive session

## Symptoms

expected: happy_path 100%, overall ≥99%
actual (before final fix): 98% — 9 failed turns across c03 (salary loop), c33 (force-escalate), c39 (generic Bengaluru)

REGRESSION 1 — Salary "20000" loop (c03 turns 6-8):
  At ASK_SALARY state, user says "20000", bot re-asks salary question
  Root cause: ALREADY FIXED — extractSalaryRange has /\b(\d{4,6})\b/ pattern that matches plain numbers
  Evidence: Live test confirmed "20000" → salary extracted → fast-path fires → asks family_size

REGRESSION 2 — Force-escalate not firing (c33 turn 4):
  After 3 invalid phones (12345, abcdefghij, 00000000000), bot asks for phone again instead of force-escalating
  Root cause: hadInvalidPhoneAttempt condition required /\d{5,}/ in message — "abcdefghij" has no digits so consecutiveFailures stayed at 1 after turn 3 (instead of 2). Turn 4 then only reached 2 (not 3 threshold).
  Fix: Changed condition to also trigger when consecutiveFailures > 0 (phone was already requested once and still not provided)

REGRESSION 3 — Generic Bengaluru skips location (c39 turn 3):
  After Mumbai → Delhi → "ok I moved to Bengaluru. 9876543210", bot skips location and asks service_type
  Root cause: ALREADY FIXED — generic city is correctly blocked when phone co-present in same message
  Evidence: Live test confirmed turn 3 → asks for area in Bengaluru, turn 4 → asks service_type

errors: No runtime errors — 200 OK responses with wrong content

## Eliminated

- hypothesis: "salary pre-extraction regex doesn't match plain '20000'"
  evidence: extractSalaryRange("20000") returns "20000" via /\b(\d{4,6})\b/ pattern; live test confirmed fix already works
  timestamp: 2026-03-02T05:00:00.000Z

- hypothesis: "generic 'Bengaluru' saved as location when phone co-present"
  evidence: isGenericCity guard correctly blocks it; live test confirmed location asked after turn 3
  timestamp: 2026-03-02T05:00:00.000Z

## Evidence

- timestamp: 2026-03-02T05:00:00.000Z
  checked: agenticMaidHire.ts line 648 — hadInvalidPhoneAttempt condition
  found: Condition was: !preExtractedPhone && phoneStillMissing && /\d{5,}/.test(message)
  implication: "abcdefghij" (no digits) at turn 3 does NOT increment consecutiveFailures — counter stuck at 1 after 2 bad attempts

- timestamp: 2026-03-02T05:10:00.000Z
  checked: Live test of c33 scenario with fix applied
  found: Turn 4 "00000000000" → consecutiveFailures reaches 3 → force-escalate fires → "Our team is standing by..."
  implication: COMPLETE keywords present in response → eval passes

- timestamp: 2026-03-02T05:15:00.000Z
  checked: Full eval run (39 conversations, 168 turns)
  found: Overall score 100% — all 168 turns pass state/slot/advance/price checks
  implication: Target ≥99% achieved (100%)

## Resolution

root_cause: Force-escalate (c33) — hadInvalidPhoneAttempt only counted digit-containing messages as phone failures. Non-digit replies (like "abcdefghij") after a failed phone attempt were NOT counted, keeping consecutiveFailures below the threshold of 3.

fix: In agenticMaidHire.ts line 652, changed hadInvalidPhoneAttempt condition from:
  !preExtractedPhone && phoneStillMissing && /\d{5,}/.test(latestMessage)
to:
  !preExtractedPhone && phoneStillMissing && (consecutiveFailures > 0 || /\d{5,}/.test(latestMessage))

This ensures ANY user response when phone is still missing and we've already asked once counts as a failure attempt.

verification: Full eval run → 100% overall score (168/168 turns on key metrics)
files_changed:
  - src/flows/agenticMaidHire.ts (line 648-653: hadInvalidPhoneAttempt condition extended)
