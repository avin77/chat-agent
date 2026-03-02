---
status: resolved
trigger: "agentic-score-91pct-improvements"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:00:00Z
---

## Current Focus

hypothesis: Schedule loop and field loops are caused by the isSavingWrongField guard blocking saves of the CORRECT field when the model tries to save a field that is not the immediate nextField. This cascades: after schedule is collected (via keyword fallback or pre-extract), the DB isn't updated because the save was blocked. On the NEXT turn, collectedData loaded from DB still lacks 'schedule', so getNextField returns 'schedule' again.

Also: validateSchedule accepts 'Full-time'/'Part-time' but the model's save_schedule action may have been blocked by isSavingWrongField because the model was trying to save schedule while the system prompt was asking for schedule — but the guard thinks it's trying to save a different field due to naming mismatch. Actually more likely: the model IS calling save_schedule correctly, but it returns 'Thank you for letting us know your preference. Would you prefer...' — meaning the tool's model message still contains the schedule question even after schedule was saved. This means the KEYWORD FALLBACK (step 13b) is appending the schedule question again.

The keyword fallback (step 13b) runs AFTER tool execution. After schedule is saved, getNextField(collectedData) should return 'salary_range'. But the keyword fallback checks if displayText contains salary_range keywords. The model's message says 'Would you prefer 24-hour Live-in...' which has schedule keywords but NOT salary keywords, so the keyword fallback APPENDS salary_range question. But then the displayText ends up having both schedule and salary keywords... Wait no — looking at the actual responses: they only show the schedule question, not salary. So the issue is the schedule question is being appended (not salary), meaning keyword fallback fires for 'salary_range' and appends 'What is your expected salary range?' but the actual output only shows schedule text... That contradicts.

REVISED HYPOTHESIS: The model is NOT successfully saving schedule. validateSchedule('Full-time') — does 'fulltime' or 'full-time' match? Let's check: SCHEDULE_TYPES includes 'full-time' and 'full time' and 'fulltime'. 'Full-time'.toLowerCase() = 'full-time' — matches. So executeToolCall should succeed.

BUT — isSavingWrongField check: nextFieldBeforeModel is captured BEFORE model call. collectedData includes pre-extracted phone/location/service_type. So if all required fields except schedule are present, nextFieldBeforeModel = 'schedule'. The model calls save_schedule. isSavingWrongField = false (names match). So tool SHOULD execute.

BUT then: after tool execution, collectedData.schedule = 'full-time'. getNextField now returns 'salary_range'. The model message contains 'Would you prefer 24-hour...' (the schedule question). The keyword fallback fires for 'salary_range' — lowerDisplay contains 'prefer' and 'live-in' and '24-hour' but NOT salary keywords. So it APPENDS the salary question. But the eval output shows the schedule question WITHOUT salary — meaning the guardrails or something is stripping the appended salary question, OR the keyword fallback is NOT appending it.

Wait — looking at actual outputs:
- c01t5 actual: "Thank you for letting us know your preference. Would you prefer a 24-hour Live-in maid..."
- Expected: "What is your expected salary range?"

The bot ACKNOWLEDGED schedule ('letting us know your preference') and then re-asked schedule. This confirms: schedule WAS saved (tool succeeded), the model's message correctly ACKNOWLEDGES it but then re-asks schedule. This means getNextField AFTER save = 'salary_range', keyword fallback checks for salary keywords, model message has none, appends salary question. But actual output still shows schedule question!

OH WAIT — I see it now. The keyword fallback code:
  displayText = displayText.replace(/\?[^?]*$/, '.').replace(/\.\s*$/, '. ') + FIELD_QUESTIONS[nextFieldForKeyword];

This REPLACES the last question with the salary question. But the actual output shows schedule question. This means either:
1. keyword fallback is NOT firing (hasKeyword is true — maybe 'prefer' is in salary_range keywords? No, it's not), OR
2. The 12b pre-extracted phone override is replacing displayText AFTER step 13b — but pre-phone check happens BEFORE 13b...

Actually 12b happens at lines 666-680, BEFORE 13b (lines 699-718). So 12b runs first, then 13b runs. If phone was pre-extracted AND 12b fires, it sets displayText to 'Thank you for sharing X! [next field question]'. Then 13b runs and the nextFieldForKeyword might show a different field.

Most importantly: check the keyword fallback schedule keywords: 'full-time', 'part-time', 'schedule', 'prefer', 'live-in', '24-hour', '12-hour', 'day maid'. The model's output 'Would you prefer a 24-hour Live-in...' contains 'prefer', '24-hour', 'live-in'.

The keyword fallback check is:
  const nextFieldForKeyword = getNextField(collectedData); // = 'salary_range' after schedule saved
  const keywords = fieldKeywords['salary_range'] = ['salary', 'range', 'budget', 'expect', 'pay'];
  const hasKeyword = keywords.some(kw => lowerDisplay.includes(kw));
  // 'Would you prefer 24-hour...' has none of these — hasKeyword = false
  // So it SHOULD append salary_range question

But actual output shows schedule question, not schedule + salary. SO: the replace regex `displayText.replace(/\?[^?]*$/, '.')` is replacing from the LAST ? to end with '.', which removes 'Would you prefer...' and then appends salary question. The result should be something like 'Thank you for letting us know your preference. What is your expected salary range?'

But the actual output is 'Thank you for letting us know your preference. Would you prefer a 24-hour Live-in...' — the schedule question is STILL THERE.

NEW HYPOTHESIS: The `isSavingWrongField` guard is BLOCKING the save_schedule call because of a subtle mismatch. Let me check: if the conversation is c01 which starts with "I need a maid" and then goes through phone → location → service_type → schedule: at turn 5 user says "Full-time". nextFieldBeforeModel is calculated from collectedData which should have phone/location/service_type but not schedule. So nextFieldBeforeModel = 'schedule'. The model calls save_schedule. isSavingWrongField = (parsed.name !== 'escalate' && 'schedule' !== null && 'save_schedule' !== 'save_schedule') = false. So tool runs. Schedule SHOULD be saved.

BUT — wait. Is the tool actually executing? Let me reconsider. The keyword fallback at step 13b uses `nextFieldForKeyword = getNextField(collectedData)`. If schedule was saved, this should be salary_range. The model's message 'Would you prefer a 24-hour...' has no salary keywords → fallback fires → REPLACES end of displayText with salary question. This produces "Thank you for letting us know your preference. What is your expected salary range?"

But the eval shows: "Thank you for letting us know your preference. Would you prefer a 24-hour Live-in maid..."

This means keyword fallback is NOT replacing the end correctly OR schedule is NOT being saved.

DEFINITIVE HYPOTHESIS: The `isSavingWrongField` block IS executing even when it shouldn't be. OR — the `validateSchedule` function returns false for some inputs like 'Full-time' or 'Part-time'. Let me check: SCHEDULE_TYPES includes 'full-time' which matches 'Full-time'.toLowerCase() = 'full-time'. OK so validate should pass.

LAST RESORT HYPOTHESIS: The model is NOT calling save_schedule. Instead it's calling action:"respond" and just outputting the schedule question again. Then getNextField(collectedData) = schedule (still not saved), keyword fallback for schedule fires, checks if 'prefer'/'live-in'/'24-hour' in displayText — YES they are in 'Would you prefer 24-hour...' so hasKeyword=true → NO fallback appended. So bot outputs the schedule question again next turn, ad infinitum.

THIS IS THE ROOT CAUSE: The model acknowledges the schedule ('Thank you for letting us know your preference') but returns action:"respond" instead of action:"save" with save_schedule. It doesn't call the tool. So schedule is never saved.

WHY does this happen? The model sees 'Full-time' and might not recognize it needs to call save_schedule. The system prompt says: "If the customer's message provides a value for 'schedule', call save_schedule with that value AND include the MANDATORY NEXT QUESTION." But the model apparently just responds.

FIX: Add pre-extraction of schedule (similar to phone pre-extraction) regardless of whether phone was also present. Currently schedule pre-extraction only happens when preExtractedPhone is set (line 498). We should ALSO pre-extract schedule when the message contains schedule keywords, even without phone.

test: Check if pre-extracting schedule (and location/service_type) unconditionally when not yet collected would fix the loop
expecting: After pre-extraction, collectedData.schedule is set, getNextField returns salary_range, keyword fallback appends salary question, score improves
next_action: Implement pre-extraction without phone dependency for schedule/location/service_type

## Symptoms

expected: npm run eval:state score ≥95% with USE_AGENTIC=true
actual: 91% — 41 failed turns with clear patterns
errors: None — all 200 OK responses, just wrong content
reproduction: npm run eval:state with USE_AGENTIC=true
started: After Phase 2 agentic implementation

## Eliminated

- hypothesis: isSavingWrongField guard blocks schedule save
  evidence: nextFieldBeforeModel would be 'schedule' and model calls 'save_schedule' — names match so guard passes
  timestamp: 2026-03-02

- hypothesis: validateSchedule rejects 'Full-time'/'Part-time'
  evidence: SCHEDULE_TYPES includes 'full-time' and 'full time' and 'fulltime' which would match
  timestamp: 2026-03-02

## Evidence

- timestamp: 2026-03-02
  checked: eval JSON failed turns
  found: c01 turns 5-7, c02 turns 5-8, c03 turns 4-8, c37 turns 5-8, c41 turns 5-8 all show schedule question being re-asked after user provides schedule
  implication: Model is not calling save_schedule — it acknowledges but uses action:"respond"

- timestamp: 2026-03-02
  checked: c01 turn 5 actual response
  found: "Thank you for letting us know your preference. Would you prefer a 24-hour Live-in maid..."
  implication: Model acknowledged but re-asked schedule. Since keyword fallback for schedule checks if 'prefer'/'24-hour'/'live-in' are in response (they are), fallback does NOT fire → no override → schedule never saved

- timestamp: 2026-03-02
  checked: c05 turns 3-7 (location loop)
  found: "Great! We have noted your location as Whitefield. Which area in Bengaluru are you looking for help?"
  implication: Same pattern — model acknowledges location but re-asks it instead of calling save_location. Location keyword fallback checks 'area'/'bengaluru' etc — these ARE in the re-asked question so fallback doesn't fire

- timestamp: 2026-03-02
  checked: c03 turns 4-8 (service_type loop)
  found: "Great! We've noted that you need help with baby care. What type of help do you need?"
  implication: Same pattern for service_type

- timestamp: 2026-03-02
  checked: c04 turns 3-4 (optional field loop - family_size)
  found: "All required fields are collected. How many family members are in your household?"
  implication: family_size is not being saved. User provides '2' → model acknowledges → re-asks family_size

- timestamp: 2026-03-02
  checked: c34 turn 2 (Hinglish)
  found: actual "Thank you! Would you like our team to call you at 9449123456?" — phone WAS pre-extracted but 12b override should fire. The issue: 12b displayText = 'Thank you for sharing 9449123456! Which area in Bengaluru...' but actual shows "Would you like our team to call you". This means 12b is NOT overriding here — OR getNextField after pre-extract returns null (all fields collected which is wrong). Actually the 12b text block IS generated but it has postPhoneNextField=location. Hmm, actual is different. Possibly the model is producing a different JSON that passes location checks via isSavingWrongField... Actually for c34 this is a separate issue — "Would you like our team to call you" violates the rule "NEVER offer to call the customer yourself".

- timestamp: 2026-03-02
  checked: pre-extraction logic (lines 498-520)
  found: Location/service_type/schedule pre-extraction only happens when preExtractedPhone is set (line 498 guard)
  implication: If user provides location/service_type/schedule WITHOUT phone in the message, those are NOT pre-extracted. The model must call the tool. When the model fails to call the tool (returns action:"respond" instead), the field is never saved and the loop begins.

## Resolution

root_cause: |
  The model (gemma-3-27b-it) frequently returns action:"respond" instead of action:"save" when the user provides values for location, service_type, and schedule. The model acknowledges the value in its message text but does not emit the JSON tool call. This causes the field to never be saved in collectedData, and since the keyword fallback checks for keywords of the CURRENT field (which are present in the re-asked question), it doesn't append the correct next-field question either.

  Additionally, pre-extraction of location/service_type/schedule is gated behind the phone being present in the SAME message (line 498), so standalone answers like "Full-time" or "Whitefield, need a cook" are not pre-extracted.

fix: |
  1. Remove the `if (preExtractedPhone)` gate for location/service_type/schedule pre-extraction.
     Always pre-extract these fields when not yet collected, regardless of whether phone was in the message.
     This is the primary fix for the schedule/location/service_type loops.

  2. Add gibberish detection: if the message is pure gibberish (all non-alphanumeric or very short random chars),
     override displayText to "I didn't catch that. [MANDATORY_NEXT_QUESTION]"

  3. Fix c04 optional field loop: after family_size is provided and ALL required fields are done,
     the model re-asks family_size instead of has_experience. This is the same root cause —
     the pre-extraction covers schedule/location/service_type but not optional fields.
     For optional fields (salary_range, family_size, has_experience), we need the keyword fallback
     to correctly enforce the next field even when model acknowledges but doesn't save.
     FIX: The keyword fallback already handles this — but the issue is the model message contains
     family_size keywords ('family', 'member', 'household') so fallback doesn't fire.
     We need pre-extraction for optional fields too, or improve the keyword fallback to not be tricked.

verification: |
  Ran npm run eval:state three times:
  - Run 1 (old server, hot-reload): 94% (partial fix)
  - Run 2 (correct server, first fixes): 96% (exceeded target)
  - Run 3 (final clean code, fresh server): 98% (far exceeds 95% target)

  Final metrics (98%):
  - State Transitions: 161/168 (96%)
  - Slot Extraction: 168/168 (100%)
  - Slot Validation: 129/129 (100%)
  - Advance Decisions: 162/168 (96%)
  - Failure Handling: 36/38 (95%)
  - No Price Leakage: 168/168 (100%)
  - Instruction Compliance: 96% (was 77%)
  - Avg Latency: 1488ms (was 3954ms — 62% faster)
  - Failed turns: 9 (was 41)

files_changed:
  - src/flows/agenticMaidHire.ts
