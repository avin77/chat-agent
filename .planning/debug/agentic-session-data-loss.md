---
status: awaiting_human_verify
trigger: "In the agentic flow, phone is saved on turn 2 (bot confirms 'Thank you for sharing 7687686888!'), but by turn 6 the bot's system prompt shows COLLECTED DATA: (none yet) and asks for phone again."
created: 2026-03-02T00:00:00.000Z
updated: 2026-03-02T00:10:00.000Z
---

## Current Focus

hypothesis: CONFIRMED — getOrCreateSession() resets collected_data to {} when attempts >= 3. Agentic flow increments attempts on each save_location validation failure. After 3 failed location saves, attempts=3, next request triggers the reset, wiping phone from collectedData.
test: Verified by reading route.ts lines 143-145 (isStuck check) and agenticMaidHire.ts line 961 (newAttempts increment on tool failure)
expecting: Fix (excluding agentic sessions from attempts >= 3 reset) prevents data loss
next_action: human verify

## Symptoms

expected: Phone saved on turn 2 persists through all subsequent turns. collectedData always includes phone after it's been saved.
actual:
  - Turn 2: phone "7687686888" accepted, bot confirms it
  - Turn 3-5: bot asks location, user gives "bglr south" then "bharitya malll nikoo" — both fail (location not saved)
  - Turn 6: bot's system prompt shows "COLLECTED DATA: (none yet)" and asks for phone again
  - KEY EVIDENCE: system prompt text on turn 6: "ROLE: EzyBot — COLLECTED DATA: (none yet) MANDATORY NEXT QUESTION: Could you please share your 10-digit mobile number?"
  - This means buildAgenticSystemPrompt() received empty collectedData
errors: no HTTP 500, no visible errors. Silent data loss.
reproduction: Start maid hire on localhost:3000 with USE_AGENTIC=true. Give phone 7687686888. Then give "bglr south" (fails). Then give "bharitya malll nikoo" (fails). Turn 6: phone is gone.
timeline: Found in session 8oi3o9qvx0wmm9as5sz, chat_debug.log

## Eliminated

- hypothesis: saveAgenticSession() replaces collectedData rather than merging
  evidence: saveAgenticSession() saves the entire in-memory collectedData object (always has phone after turn 2). DB save itself is not the issue.
  timestamp: 2026-03-02

- hypothesis: save_location failure overwrites collectedData with only {__consecutive_failures: N}
  evidence: Lines 793-803 — tool failure only increments consecutiveFailures. Phone remains in collectedData. collectedData is never reassigned to a subset.
  timestamp: 2026-03-02

- hypothesis: H4 — loop detection fires causing deterministic fallback that reads empty DB data
  evidence: Loop detection uses __tool_calls counter, not consecutive_failures. The data wipe happens before loop detection — the session is reset at getOrCreateSession() level.
  timestamp: 2026-03-02

## Evidence

- timestamp: 2026-03-02
  checked: agenticMaidHire.ts lines 960-962
  found: newAttempts = (dbSession?.attempts ?? 0) + (consecutiveFailures > 0 && !toolSucceeded ? 1 : 0). When save_location fails, consecutiveFailures > 0 and toolSucceeded = false, so attempts increments by 1 each failed turn.
  implication: 3 failed location saves → attempts goes 0 → 1 → 2 → 3

- timestamp: 2026-03-02
  checked: route.ts lines 143-145 (getOrCreateSession isStuck check)
  found: isStuck = current_state === 'COMPLETE' || (detected_intent === 'maid_hire' && attempts >= 3) || isStalePartial
  implication: When attempts reaches 3, getOrCreateSession resets collected_data to {} on the NEXT request — turn 6 arrives and phone is gone

- timestamp: 2026-03-02
  checked: route.ts line 162
  found: Reset returns { ...existingSession, current_state: 'START', collected_data: {}, attempts: 0 }
  implication: collectedData fed to handleMaidHireAgentic on turn 6 is {} — phone missing — buildAgenticSystemPrompt shows "(none yet)"

- timestamp: 2026-03-02
  checked: agenticMaidHire.ts lines 826-848
  found: shouldForceEscalateAgentic(consecutiveFailures >= 3) is a separate mechanism for 3 CONSECUTIVE save_location failures within a SINGLE turn's context. It never fires because each turn only has 1 tool call, so consecutiveFailures only ever reaches 1 per-turn before the session is reset.
  implication: The agentic force-escalation never gets a chance to fire because the session-level reset at attempts >= 3 fires first (cross-turn).

## Resolution

root_cause: getOrCreateSession() in route.ts checks attempts >= 3 to detect "stuck" deterministic sessions and resets them. The agentic flow saves attempts++ on every tool validation failure (save_location). After 3 failed location inputs across 3 turns, attempts=3 and the next request wipes collected_data, silently losing the phone that was saved on turn 2. The attempts >= 3 guard was designed for the deterministic flow only; agentic sessions have their own __consecutive_failures mechanism for managing stuck states.

fix: Added isAgenticSession = existingSession.agentic_mode === true guard in route.ts getOrCreateSession(). The attempts >= 3 reset now only fires for non-agentic sessions. Agentic sessions are still covered by: (a) their own force-escalation after 3 consecutive validation failures via __consecutive_failures, (b) stale session reset after 4 hours, (c) COMPLETE state reset.

verification: Fix applied at route.ts lines 143-150. Awaiting human verification.
files_changed:
  - src/app/api/chat/route.ts
