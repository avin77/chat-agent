# V3-01 CONTEXT - Intent Contract + English Policy

## Phase

- Phase ID: V3-01
- Phase Name: Intent Contract + English Policy
- Date: 2026-03-03
- Source: PM discussion (multi-intent, confusion, metrics, eval reliability)

## Scope Boundary

This phase defines routing and language policy for all chatbot turns.
It does not ship full orchestration logic by itself (that is V3-02), but it locks intent names, intent contracts, and language behavior used by all later phases.

## Locked Decisions

### 1) Canonical intent taxonomy

Use exactly these intent IDs end-to-end:
- `maid_hire`
- `complaint`
- `maid_registration`
- `general`

Rules:
- Existing aliases like `helper_reg` must be normalized to `maid_registration`.
- Dashboard and eval datasets must use the same canonical IDs.

### 2) Intent flow definitions must be tied to playbooks

Decision: Yes. Every intent flow must be defined by V3-04 playbooks.

Minimum playbook sections per intent:
- `entry_ack`
- `required_fields`
- `optional_fields`
- `validation_rules`
- `repair_protocol`
- `completion_template`
- `escalation_policy`

### 3) English-only output policy

- Bot responses are always English.
- User can input Hinglish/non-English; extraction + classification still run.
- If user requests non-English reply, bot keeps English and gives one-line policy clarification.
- Do not fail silently due to language mismatch.

### 4) Wrong phone retry behavior

User concern: valid phone may come after 3 failed attempts.

Decision:
- No hard lockout at 3 attempts.
- After each invalid phone, remain in same slot (`ASK_PHONE`).
- After 3 invalid attempts, change repair strategy tone and offer support option, but keep accepting a future valid phone.
- If user provides valid phone on attempt 4 or later, continue normal flow immediately.
- Current agentic guardrail (`__consecutive_failures` + force-escalate messaging) should remain soft: even after force-escalate text, a subsequent valid phone must resume flow instead of permanently blocking user progress.

Suggested thresholds:
- Attempt 1-2: simple re-ask with example.
- Attempt 3: clarify why number is needed + re-ask.
- Attempt >=4: offer callback/support handoff while still accepting valid phone input.

### 5) Multi-intent memory storage design (for V3-02 consumer)

Required session fields (recommended):
- `active_intent` (string)
- `intent_stack` (jsonb array)  
  each item: `{ intent, suspended_at, state_snapshot, slots_snapshot }`
- `intent_history` (jsonb array)  
  each item: `{ from, to, reason, turn, ts }`
- `slots_by_intent` (jsonb object)

Example:
```json
{
  "active_intent": "complaint",
  "intent_stack": [
    {
      "intent": "maid_hire",
      "suspended_at": "ASK_SERVICE",
      "state_snapshot": "ASK_SERVICE",
      "slots_snapshot": {"phone": "9988776655", "location": "Whitefield"}
    }
  ],
  "intent_history": [
    {"from": "maid_hire", "to": "complaint", "reason": "user_switch", "turn": 5, "ts": "2026-03-03T11:10:00Z"}
  ],
  "slots_by_intent": {
    "maid_hire": {"phone": "9988776655", "location": "Whitefield"},
    "complaint": {"issue_type": "no_show"}
  }
}
```

### 6) Prompt contract changes (for V3-02 consumer)

Prompt must explicitly include:
- `ACTIVE_INTENT`
- `INTENT_STACK_SUMMARY`
- `CURRENT_REQUIRED_FIELDS`
- `KNOWN_SLOTS_FOR_ACTIVE_INTENT`
- `LANGUAGE_POLICY=ENGLISH_ONLY`
- `REPAIR_STAGE` (normal/clarify/reframe/escalate)

Example prompt block:
```text
ACTIVE_INTENT: maid_hire
INTENT_STACK: []
LANGUAGE_POLICY: Respond only in English. User may write in Hinglish.
KNOWN_SLOTS: phone=9988776655, location=Whitefield
NEXT_REQUIRED_FIELD: service_type
REPAIR_STAGE: clarify
If user switches intent (complaint/maid_registration), push current intent to stack and continue in new intent without dropping known slots.
```

### 7) PM metrics to prove these fixes worked

Primary success metrics:
- Intent routing accuracy
- Intent switch success rate
- Resume success rate (return-to-previous-intent correctness)
- Slot retention after switch rate
- Repeat-question rate
- Retry recovery rate (invalid -> valid progression)
- Escalation-after-confusion rate
- Lead quality score
- Safety net trigger rate
- Semantic paraphrase success
- Ambiguity resolution rate
- Intent drift rate
- Guardrail bypass attempt rate
- Hallucination rate (HITL sample)
- Stuck loop rate

Guardrail metrics:
- Stuck loop rate (same state > N turns)
- Slot reset incident rate (unexpected slot loss)
- Wrong-intent reset incidents

Eval metrics:
- `eval:state` score and failed-turn count
- `eval:unhappy` score and failed-turn count
- `eval` normal suite score
- Slice-level pass for `synonym_hinglish_service` and `other_intent_as_answer`

## Dashboard Clarification Requirements (for V3-05)

Do not remove current metrics now. Add definitions and derived views:
- Each card needs: formula, source table, time window, interpretation.
- Add drill-down for failed-turn IDs and intent-switch traces.
- Add memory trace panel to verify LLM remembered prior intent state.

## Deferred / Out of Scope

- Shadow-system expansion work is excluded for this v3 planning pass (per PM decision).

## Next Steps

1. Run `gsd-research-phase` for V3-01 and V3-05 with this context.
2. Plan V3-02 orchestration schema migration and route/prompt updates.
3. Add eval slices for intent-memory and phone-retry recovery scenarios.
