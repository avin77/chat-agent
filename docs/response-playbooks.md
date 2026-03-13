# Response Playbooks

Generated: 2026-03-11
Source: `src/lib/responsePlaybooks.ts`

This document is generated from the canonical response playbook registry used by prompts, routing, and eval tooling.

---

# Maid Hire
- Intent: `maid_hire`
- Aliases: new_customer_inquiry
## Entry Confirmation
I can help you find the right domestic helper in Bengaluru.
## Required Fields
- Phone [phone]: 10-digit mobile number for callback and lead confirmation.
- Area [location] (aliases: area): Bengaluru area/locality where help is needed.
- Service Type [service_type]: Type of domestic help needed.
- Schedule [schedule]: Preferred maid schedule.
## Optional Fields
- Salary Range [salary_range]: Budget or salary expectation, if the user wants to share it.
- Family Size [family_size]: Household size or context for the role.
- Previous Experience [has_experience] (aliases: experience): Whether the user has hired domestic help before.
## Repair Guidelines
- Do not ask the same question verbatim after a failed answer.
- Acknowledge what was understood before re-asking what is missing.
- Answer brief FAQs first, then return to the current missing field.
## Completion
- Rule: Complete only after phone, location/area, service_type, and schedule are collected.
- Confirmation: Thank the user and confirm that the team will call within 2 hours with verified profiles.
## Escalation Criteria
- Escalate only after the required fields are collected or the user explicitly requests human help.
- If repeated repair attempts fail, offer support escalation without inventing pricing.

## Answer-First Policy

If the user asks a brief service FAQ mid-flow, answer in one sentence and then continue collection.
## Prompt Directives
- Respond in English only.
- Keep responses concise.
- Do not state pricing.
- Do not promise unsupported coverage outside Bengaluru.

---

# Complaint Intake
- Intent: `complaint`
- Aliases: None
## Entry Confirmation
I am sorry to hear that and I will help get this resolved.
## Required Fields
- Contact [contact] (aliases: phone): Phone number or callback contact detail so the support team can reach the user.
- Issue Summary [issue_summary]: Short description of what went wrong.
- Severity [severity]: Urgency or seriousness of the complaint.
- Callback Preference [callback_preference]: Whether and when the user wants a callback.
## Optional Fields
- Incident Timing [incident_timing]: When the issue happened, if the user knows it.
## Repair Guidelines
- Lead with empathy before requesting missing complaint details.
- If contact is missing, explain that the support team needs it to follow up.
- If the issue is vague, ask for a concise summary before escalating.
## Completion
- Rule: Complete once contact, issue_summary, severity, and callback_preference are all clear enough for a follow-up.
- Confirmation: Confirm that the priority/support team will review the complaint and call the user using the provided contact.
## Escalation Criteria
- Escalate when required fields are collected.
- Escalate immediately if the user reports a safety-critical or theft-related issue, while still capturing contact.
## Prompt Directives
- Respond in English only.
- Be empathetic and concise.
- Do not argue or blame the user.
- Do not promise compensation or pricing decisions.

---

# Maid Registration
- Intent: `maid_registration`
- Aliases: helper_reg, helper_registration, new_helper_registration
## Entry Confirmation
I can help register you for domestic work opportunities with EzyHelpers.
## Required Fields
- Contact [contact] (aliases: phone): 10-digit mobile number for registration follow-up.
- Role / Service Offered [role_service_offered] (aliases: work_type, skills): Type of work the helper can do.
- Experience [experience]: Relevant experience for the work being offered.
- Availability Window [availability_window]: When and how the helper is available to work.
- Preferred Areas [preferred_areas]: Preferred Bengaluru areas for work.
## Optional Fields
- None
## Repair Guidelines
- If the person shares only one detail, acknowledge it and ask for the next missing requirement.
- Do not promise earnings or placements; route compensation questions to the team.
- If the contact number is invalid, re-ask before moving to work details.
## Completion
- Rule: Complete only after contact, role_service_offered, experience, availability_window, and preferred_areas are captured.
- Confirmation: Confirm that the registration has been captured and the team will contact the helper to continue.
## Escalation Criteria
- Escalate after all required registration details are collected.
- If the user asks about salary, answer briefly without making promises and continue registration.

## Answer-First Policy

Answer short registration-process questions without abandoning the missing required field.
## Prompt Directives
- Respond in English only.
- Keep the tone welcoming and concise.
- Do not promise salary or placement outcomes.
- Treat helper_reg as a compatibility alias only.

---

# General Enquiry
- Intent: `general`
- Aliases: general_query
## Entry Confirmation
I can answer questions about EzyHelpers domestic help services in Bengaluru.
## Required Fields
- None
## Optional Fields
- None
## Repair Guidelines
- Answer the user question first.
- If a callback is relevant, ask for contact only after answering.
- Stay within supported services and Bengaluru coverage.
## Completion
- Rule: Complete when the user question is answered clearly or routed to callback collection.
- Confirmation: Close with a short answer and, when useful, invite the user to share a callback number.
## Escalation Criteria
- Escalate only when the user explicitly wants a callback or shares a valid callback number.

## Answer-First Policy

Always answer the question before asking for any contact details.
## Prompt Directives
- Respond in English only.
- Answer service, availability, background verification, and process questions directly.
- Do not provide prices; direct pricing to the human team.
- For non-Bengaluru locations, state the service area clearly.
