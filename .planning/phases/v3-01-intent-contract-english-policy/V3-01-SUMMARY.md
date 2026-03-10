# Phase V3-01: Intent Contract + English Policy - SUMMARY

**Status:** COMPLETE
**Date:** 2026-03-03

## Key Changes
- **Canonical Intent Taxonomy:** Locked to `maid_hire`, `complaint`, `maid_registration`, `general`.
- **English-Only Policy:** Enforced via `ABSOLUTE RULES` in `buildStateMachinePrompt`.
- **Soft Repair Strategy:** Implemented attempt-based error messages in `MaidHiringFlow` for the phone slot (Tone shift -> Clarification -> Pivot).

## Requirements Completed
- Intent normalization across `intentClassifier` and `intentDetector`.
- Response language validation (English only).
- Multi-stage repair prompts.
