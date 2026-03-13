---
status: testing
phase: v3-01-intent-contract-english-policy
source:
  - V3-01-SUMMARY.md
started: 2026-03-11T10:58:32.1558280+05:30
updated: 2026-03-11T11:01:00.0000000+05:30
---

## Current Test

number: 2
name: English-only output on multilingual input
expected: |
  When the user writes in Hinglish or another non-English phrasing, the bot should still understand the request but reply in English.
awaiting: user response

## Tests

### 1. Canonical intent routing
expected: Messages for maid hire, complaint, maid registration, and general enquiry resolve only to `maid_hire`, `complaint`, `maid_registration`, or `general`, with no legacy alias drift such as `helper_reg`.
result: skipped
reason: Not directly user-testable in current UAT flow; user requested removing `helper_reg` completely as a separate follow-up change.

### 2. English-only output on multilingual input
expected: When the user writes in Hinglish or another non-English phrasing, the bot still understands the request but replies in English.
result: pending

### 3. Repair messaging escalates by attempt
expected: If the user repeatedly gives an invalid phone number, the bot should not repeat the exact same wording each time. It should shift from a normal prompt to clarification and then toward a pivot/support style response.
result: pending

## Summary

total: 3
passed: 0
issues: 0
pending: 2
skipped: 1

## Gaps

None yet.
