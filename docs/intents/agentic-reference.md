# Agentic Intent Reference

Updated: 2026-03-12
Owner: PM owns policy rows and go-live criteria. Engineering owns runtime implementation details and telemetry wiring.

## How To Use This Doc

- Edit this document when product policy changes for required fields, escalation behavior, or answer-first behavior.
- Do not edit code-only implementation details here. Reference the runtime files instead.
- Use `npm run test:phase14` before promoting agentic behavior more broadly.

## Canonical Intents

### maid_hire

- Supported user goals: Hire a maid, cook, cleaner, babysitter, or elderly-care helper in Bengaluru.
- Required fields: `phone`, `location`, `service_type`, `schedule`
- Optional fields: `salary_range`, `family_size`, `has_experience`
- Completion rule: Required fields collected, optional fields either collected or explicitly skipped.
- Escalation rule: Escalate after completion or if the user explicitly requests human help.
- Answer-first FAQ behavior: Briefly answer service/process questions, then continue the next missing field.
- Suspend / resume notes: Can be suspended for complaint or maid_registration and resumed from the exact next missing field.
- Known validation caveats: Invalid partial phone numbers must be rejected; Bengaluru-only location validation applies.
- Live route / runtime references: `src/app/api/chat/route.ts`, `src/flows/agenticMaidHire.ts`, `src/lib/agentic/runtime.ts`

### complaint

- Supported user goals: Report late staff, poor service, damage, safety issues, or callback requests for service problems.
- Required fields: `contact`, `issue_summary`, `severity`, `callback_preference`
- Optional fields: `incident_timing`
- Completion rule: Required complaint details are clear enough for follow-up.
- Escalation rule: Escalate when required details are present; treat safety-critical issues as urgent.
- Answer-first FAQ behavior: Empathize first, then collect missing complaint data.
- Suspend / resume notes: May interrupt maid_hire, then return the user to the suspended parent flow.
- Known validation caveats: Contact must be a valid 10-digit mobile number; vague complaint summaries need repair.
- Live route / runtime references: `src/app/api/chat/route.ts`, `src/lib/agentic/runtime.ts`

### maid_registration

- Supported user goals: Register a helper for cooking, cleaning, baby care, elderly care, or related domestic work.
- Required fields: `contact`, `role_service_offered`, `experience`, `availability_window`, `preferred_areas`
- Optional fields: None in the current runtime contract.
- Completion rule: All required registration details are present.
- Escalation rule: Escalate after required details are collected.
- Answer-first FAQ behavior: Answer short process questions without promising salary or placement outcomes.
- Suspend / resume notes: Can suspend another active intent, but should usually resume the parent flow once registration capture is complete.
- Known validation caveats: `helper_reg` remains a compatibility alias only; preferred areas still validate against Bengaluru areas.
- Live route / runtime references: `src/app/api/chat/route.ts`, `src/lib/agentic/runtime.ts`

### general

- Supported user goals: Ask about services, availability, coverage, verification, and process.
- Required fields: None
- Optional fields: Callback number when the user wants a follow-up call.
- Completion rule: The question is answered clearly, or the user asks for a callback.
- Escalation rule: Only escalate when the user shares a callback number or explicitly asks for follow-up.
- Answer-first FAQ behavior: Always answer first.
- Suspend / resume notes: General FAQ turns should not destroy an active suspended flow.
- Known validation caveats: Stay within Bengaluru coverage and avoid pricing promises.
- Live route / runtime references: `src/app/api/chat/route.ts`, `src/lib/agentic/runtime.ts`

## Rollout Readiness

- Minimum parity threshold: Shadow agreement at or above 95% over the review window.
- Multi-intent regression gate: `npm run test:phase14` must pass locally.
- Data-integrity gate: No known slot-capture corruption bugs for phone, location, service type, or side-intent resume.
- PM signoff gate: PM has reviewed this document and agrees the field, escalation, and answer-first policies match the intended product behavior.

## Current Recommendation

- Default recommendation: Keep the shared runtime under deliberate rollout control until shadow disagreement categories are reviewed in the dashboard.
- Promote agentic behavior only after parity, regression, and PM policy review all pass together.
