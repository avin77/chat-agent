---
status: resolved
trigger: "Audit phone number edge cases in eval dataset, add missing cases, run eval, fix any failures"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T06:00:00Z
---

## Current Focus

hypothesis: extractPhone() already handles most edge cases via its 3-pattern approach (bare 10-digit, +91 prefix, 91 prefix), but leading-zero (09876543210) and prefix-text (ph9876543210) cases are NOT covered
test: trace regex patterns against each edge case input
expecting: find exactly which inputs fail extraction, then fix + add dataset cases
next_action: verify each pattern against each edge case, then add dataset entries + run eval

## Symptoms

expected: All phone number edge cases handled correctly — extraction, validation, re-ask on invalid
actual: Unknown — current golden dataset only covers: 5-digit phone (c06), letters instead of phone (c07), wrong starting digit 1xxx (c08), phone upfront in first message (c29), force-escalate after 3 fails (c33)

Missing edge cases:
1. 11-digit with country code: "919876543210" or "91 9876543210"
2. Phone with prefix text: "ph9876543210" or "call me at ph-9876543210"
3. Phone with spaces: "98765 43210" or "9876 54 3210"
4. Leading zero: "09876543210" — after stripping leading 0: 9876543210 (valid)
5. Intent switch during phone ask: user says "I want to complain" — should switch intent
6. Angry user mid-flow: "your service is terrible" at ASK_PHONE — acknowledge + re-ask
7. FAQ during phone ask: "do you work in Delhi?" — answer FAQ + re-ask phone

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-02T00:00:00Z
  checked: src/extractors/dataExtractor.ts — extractPhone() function
  found: |
    Three patterns:
    1. /\b([6-9]\d{9})\b/g — matches bare 10-digit starting 6-9
    2. /\b(\+91[\s-]?[6-9]\d{9})\b/g — matches +91 prefix
    3. /\b(91[\s-]?[6-9]\d{9})\b/g — matches 91 prefix (no +)
    All patterns: take match[0], strip non-digits, slice(-10), then isValidPhone()
  implication: |
    - "919876543210" — matches pattern 3 (91[6-9]\d{9}), strip+slice gives 9876543210. WORKS.
    - "91 9876543210" — pattern 3 allows [\s-]? so matches. WORKS.
    - "+91 9876543210" — pattern 2 matches. WORKS.
    - "98765 43210" — has spaces. Pattern 1 uses \b word boundary. The \b before 9 works, but
      "98765 43210" is TWO words ("98765" and "43210") — pattern 1 won't match 10-digit.
      Pattern 2/3 won't match (no +91/91 prefix). FAILS — only extracts "98765" (5 digits, invalid).
    - "09876543210" — starts with 0, patterns 1-3 all require [6-9] first digit. FAILS — no match.
    - "ph9876543210" — "ph" before digits. Pattern 1 has \b before digit, but ph-then-digit has
      no word boundary between letters and digits. FAILS — no match via pattern 1.
      Pattern 3 checks for "91" prefix — "ph9876543210" won't match. FAILS.
    - "ph-9876543210" — "ph-" then digits. The \b is between "-" and "9" (punct-digit boundary),
      so pattern 1 should match "9876543210". WORKS (tested mentally: \b exists at punct→digit).
    - "call me at ph9876543210" — same as "ph9876543210". The \b between 'h' and '9' — 'h' is
      \w and '9' is \w, so NO word boundary. FAILS.

- timestamp: 2026-03-02T00:00:00Z
  checked: isValidPhone() — /^[6-9]\d{9}$/.test(phone)
  found: Only accepts 10-digit strings starting with 6-9.
  implication: Leading-zero case "09876543210" stripped = "09876543210", slice(-10) = "9876543210" —
    wait, actually: cleaned = "09876543210" (11 chars), phone = cleaned.slice(-10) = "9876543210".
    BUT the issue is the pattern never matches "09876543210" in the first place because pattern 1
    requires first digit to be [6-9]. So it never even reaches slice(-10).
    FIX NEEDED: Add a pattern for leading-zero: /\b(0[6-9]\d{9})\b/g — strip + slice(-10) = valid.

- timestamp: 2026-03-02T00:00:00Z
  checked: "ph9876543210" case — word boundary analysis
  found: In "ph9876543210", 'h' and '9' are both \w chars, so \b does NOT exist between them.
    Pattern 1 /\b([6-9]\d{9})\b/g won't match "9876543210" when immediately preceded by a letter.
  implication: Need to add pattern: /(?<![0-9])([6-9]\d{9})(?!\d)/g — negative lookbehind for digit.
    Or simpler: strip non-digit-or-plus chars and then apply validation.
    Better approach: add pattern /(\b|(?<=\D))([6-9]\d{9})(?!\d)/g

- timestamp: 2026-03-02T00:00:00Z
  checked: "98765 43210" (phone with space in middle) case
  found: Pattern 1 won't match (only matches continuous 10-digit). Patterns 2/3 need +91/91 prefix.
  implication: Need new pattern that handles space/hyphen in middle of number.
    Approach: /\b([6-9]\d{4})[\s-](\d{5})\b/g — matches "98765 43210" format

## Resolution

root_cause: |
  Three extractPhone() gaps in src/extractors/dataExtractor.ts:
  1. Pattern 1 used \b word boundary — fails when number immediately follows alpha char (ph9876543210).
     'h' and '9' are both \w so no word boundary exists between them.
  2. No pattern for leading-zero format (09876543210).
  3. No pattern for space/hyphen-split formats (98765 43210).
  The 91-prefix format (919876543210) already worked via pattern 3.

fix: |
  - Changed pattern 1 from /\b([6-9]\d{9})\b/g to /(?<!\d)([6-9]\d{9})(?!\d)/g
    (negative lookbehind for digit only — allows letter-prefixed inputs to match)
  - Changed pattern 2 (91 prefix) from \b boundary to (?<!\d) lookbehind
  - Added: /(?<!\d)(0[6-9]\d{9})(?!\d)/g — leading zero
  - Added: /(?<!\d)([6-9]\d{4}[\s-]\d{5})(?!\d)/g — 5+5 split
  - Added: /(?<!\d)([6-9]\d{3}[\s-]\d{3}[\s-]\d{3})(?!\d)/g — 4+3+3 split
  All patterns: strip non-digits from match, slice(-10), validate with isValidPhone()

verification: |
  - 21/21 unit tests pass (all formats + regression cases)
  - Full eval: 46 conversations, 184 turns — 100% PRODUCTION READY
  - 7 new eval cases (c42-c48) all pass
  - Existing 39 cases unchanged — all still pass

files_changed:
  - src/extractors/dataExtractor.ts — extractPhone() patterns updated
  - data/state-golden-dataset.json — 7 new conversations added (c42-c48)
