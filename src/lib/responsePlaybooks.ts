export type CanonicalIntentId =
  | 'maid_hire'
  | 'complaint'
  | 'maid_registration'
  | 'general';
import { getServiceVocabularyPromptHint } from './serviceVocabulary.ts';

export type ResponseFieldId =
  | 'phone'
  | 'location'
  | 'service_type'
  | 'schedule'
  | 'salary_range'
  | 'family_size'
  | 'has_experience'
  | 'contact'
  | 'issue_summary'
  | 'severity'
  | 'callback_preference'
  | 'incident_timing'
  | 'role_service_offered'
  | 'experience'
  | 'availability_window'
  | 'preferred_areas';

export interface ResponseFieldSpec {
  id: ResponseFieldId;
  label: string;
  description: string;
  aliases?: string[];
  promptHint?: string;
  repairHint?: string;
}

export interface ResponsePlaybook {
  intent: CanonicalIntentId;
  displayName: string;
  aliases: string[];
  entryConfirmation: string;
  requiredFields: ResponseFieldSpec[];
  optionalFields: ResponseFieldSpec[];
  repairGuidelines: string[];
  completionRule: string;
  completionConfirmation: string;
  escalationCriteria: string[];
  answerFirstPolicy?: string;
  promptDirectives: string[];
}

const makeField = (
  id: ResponseFieldId,
  label: string,
  description: string,
  options: Partial<Omit<ResponseFieldSpec, 'id' | 'label' | 'description'>> = {},
): ResponseFieldSpec => ({
  id,
  label,
  description,
  ...options,
});

const SERVICE_PROMPT_HINT = getServiceVocabularyPromptHint();

export const RESPONSE_PLAYBOOKS: Record<CanonicalIntentId, ResponsePlaybook> = {
  maid_hire: {
    intent: 'maid_hire',
    displayName: 'Maid Hire',
    aliases: ['new_customer_inquiry'],
    entryConfirmation: 'I can help you find the right domestic helper in Bengaluru.',
    requiredFields: [
      makeField('phone', 'Phone', '10-digit mobile number for callback and lead confirmation.', {
        promptHint: 'Ask for a valid 10-digit number.',
        repairHint: 'Explain why a valid number is needed and re-ask clearly.',
      }),
      makeField('location', 'Area', 'Bengaluru area/locality where help is needed.', {
        aliases: ['area'],
        promptHint: 'Ask for the Bengaluru locality.',
        repairHint: 'If outside Bengaluru, explain the service area and re-ask for a Bengaluru location.',
      }),
      makeField('service_type', 'Service Type', 'Type of domestic help needed.', {
        promptHint: `Offer Cooking, Cleaning, Baby Care, and Elderly Care. ${SERVICE_PROMPT_HINT}`,
        repairHint: 'Ask the user to choose one or a valid combination.',
      }),
      makeField('schedule', 'Schedule', 'Preferred maid schedule.', {
        promptHint: 'Clarify 24-hour live-in vs 12-hour day / full-time vs part-time.',
        repairHint: 'Reframe the schedule question with one concrete example.',
      }),
    ],
    optionalFields: [
      makeField('salary_range', 'Salary Range', 'Budget or salary expectation, if the user wants to share it.', {
        promptHint: 'Allow skip if unsure.',
      }),
      makeField('family_size', 'Family Size', 'Household size or context for the role.', {
        promptHint: 'Allow skip if the user prefers not to answer.',
      }),
      makeField('has_experience', 'Previous Experience', 'Whether the user has hired domestic help before.', {
        aliases: ['experience'],
        promptHint: 'Allow skip or any short explanation.',
      }),
    ],
    repairGuidelines: [
      'Do not ask the same question verbatim after a failed answer.',
      'Acknowledge what was understood before re-asking what is missing.',
      'Answer brief FAQs first, then return to the current missing field.',
    ],
    completionRule: 'Complete only after phone, location/area, service_type, and schedule are collected.',
    completionConfirmation: "Thank you! I've shared your requirements with our team. We'll call you within 2 hours with verified profiles matching your needs.",
    escalationCriteria: [
      'Escalate only after the required fields are collected or the user explicitly requests human help.',
      'If repeated repair attempts fail, offer support escalation without inventing pricing.',
    ],
    answerFirstPolicy: 'If the user asks a brief service FAQ mid-flow, answer in one sentence and then continue collection.',
    promptDirectives: [
      'Respond in English only.',
      'Keep responses concise.',
      'Do not state pricing.',
      'Do not promise unsupported coverage outside Bengaluru.',
    ],
  },
  complaint: {
    intent: 'complaint',
    displayName: 'Complaint Intake',
    aliases: [],
    entryConfirmation: 'I am sorry to hear that and I will help get this resolved.',
    requiredFields: [
      makeField('contact', 'Contact', 'Phone number or callback contact detail so the support team can reach the user.', {
        aliases: ['phone'],
        promptHint: 'Ask for the 10-digit callback number early.',
        repairHint: 'If the phone number is invalid or missing, explain that a callback number is required.',
      }),
      makeField('issue_summary', 'Issue Summary', 'Short description of what went wrong.', {
        promptHint: 'Ask what happened in one line if the complaint is vague.',
      }),
      makeField('severity', 'Severity', 'Urgency or seriousness of the complaint.', {
        promptHint: 'Clarify whether the issue is urgent, serious, or standard follow-up.',
      }),
      makeField('callback_preference', 'Callback Preference', 'Whether and when the user wants a callback.', {
        promptHint: 'Ask for callback preference if the user has not already implied it.',
      }),
    ],
    optionalFields: [
      makeField('incident_timing', 'Incident Timing', 'When the issue happened, if the user knows it.', {
        promptHint: 'Capture time/date only when available; do not block on it.',
      }),
    ],
    repairGuidelines: [
      'Lead with empathy before requesting missing complaint details.',
      'If contact is missing, explain that the support team needs it to follow up.',
      'If the issue is vague, ask for a concise summary before escalating.',
    ],
    completionRule: 'Complete once contact, issue_summary, severity, and callback_preference are all clear enough for a follow-up.',
    completionConfirmation: 'Thank you for sharing the details. Our support team will review your complaint and call you shortly to resolve it.',
    escalationCriteria: [
      'Escalate when required fields are collected.',
      'Escalate immediately if the user reports a safety-critical or theft-related issue, while still capturing contact.',
    ],
    promptDirectives: [
      'Respond in English only.',
      'Be empathetic and concise.',
      'Do not argue or blame the user.',
      'Do not promise compensation or pricing decisions.',
    ],
  },
  maid_registration: {
    intent: 'maid_registration',
    displayName: 'Maid Registration',
    aliases: ['helper_reg', 'helper_registration', 'new_helper_registration'],
    entryConfirmation: 'I can help register you for domestic work opportunities with EzyHelpers.',
    requiredFields: [
      makeField('contact', 'Contact', '10-digit mobile number for registration follow-up.', {
        aliases: ['phone'],
        promptHint: 'Ask for the 10-digit mobile number if missing.',
        repairHint: 'Explain the registration cannot proceed without a valid callback number.',
      }),
      makeField('role_service_offered', 'Role / Service Offered', 'Type of work the helper can do.', {
        aliases: ['work_type', 'skills'],
        promptHint: `Clarify whether the person does cooking, cleaning, baby care, elderly care, or a combination. ${SERVICE_PROMPT_HINT}`,
      }),
      makeField('experience', 'Experience', 'Relevant experience for the work being offered.', {
        promptHint: 'Capture years or short experience summary.',
      }),
      makeField('availability_window', 'Availability Window', 'When and how the helper is available to work.', {
        promptHint: 'Capture full-time, part-time, live-in, shift preference, or start window.',
      }),
      makeField('preferred_areas', 'Preferred Areas', 'Preferred Bengaluru areas for work.', {
        promptHint: 'Capture the Bengaluru localities where the helper prefers to work.',
      }),
    ],
    optionalFields: [],
    repairGuidelines: [
      'If the person shares only one detail, acknowledge it and ask for the next missing requirement.',
      'Do not promise earnings or placements; route compensation questions to the team.',
      'If the contact number is invalid, re-ask before moving to work details.',
    ],
    completionRule: 'Complete only after contact, role_service_offered, experience, availability_window, and preferred_areas are captured.',
    completionConfirmation: 'Thank you! Your registration is complete. Our team will contact you soon to discuss available work opportunities.',
    escalationCriteria: [
      'Escalate after all required registration details are collected.',
      'If the user asks about salary, answer briefly without making promises and continue registration.',
    ],
    answerFirstPolicy: 'Answer short registration-process questions without abandoning the missing required field.',
    promptDirectives: [
      'Respond in English only.',
      'Keep the tone welcoming and concise.',
      'Do not promise salary or placement outcomes.',
      'Treat helper_reg as a compatibility alias only.',
    ],
  },
  general: {
    intent: 'general',
    displayName: 'General Enquiry',
    aliases: ['general_query'],
    entryConfirmation: 'I can answer questions about EzyHelpers domestic help services in Bengaluru.',
    requiredFields: [],
    optionalFields: [],
    repairGuidelines: [
      'Answer the user question first.',
      'If a callback is relevant, ask for contact only after answering.',
      'Stay within supported services and Bengaluru coverage.',
    ],
    completionRule: 'Complete when the user question is answered clearly or routed to callback collection.',
    completionConfirmation: "I'm here to help! Feel free to ask about our services or share your callback number if you'd like our team to reach out.",
    escalationCriteria: [
      'Escalate only when the user explicitly wants a callback or shares a valid callback number.',
    ],
    answerFirstPolicy: 'Always answer the question before asking for any contact details.',
    promptDirectives: [
      'Respond in English only.',
      'Answer service, availability, background verification, and process questions directly.',
      'Do not provide prices; direct pricing to the human team.',
      'For non-Bengaluru locations, state the service area clearly.',
    ],
  },
};

const INTENT_ALIASES: Record<string, CanonicalIntentId> = Object.values(RESPONSE_PLAYBOOKS).reduce(
  (accumulator, playbook) => {
    accumulator[playbook.intent] = playbook.intent;
    playbook.aliases.forEach((alias) => {
      accumulator[alias] = playbook.intent;
    });
    return accumulator;
  },
  {} as Record<string, CanonicalIntentId>,
);

export const MAID_HIRE_PLAYBOOK = RESPONSE_PLAYBOOKS.maid_hire;
export const MAID_HIRE_REQUIRED_FIELD_IDS = MAID_HIRE_PLAYBOOK.requiredFields.map((field) => field.id);
export const MAID_HIRE_OPTIONAL_FIELD_IDS = MAID_HIRE_PLAYBOOK.optionalFields.map((field) => field.id);

export function normalizeIntentId(intent: string): CanonicalIntentId {
  return INTENT_ALIASES[intent] ?? 'general';
}

export function getResponsePlaybook(intent: string): ResponsePlaybook {
  return RESPONSE_PLAYBOOKS[normalizeIntentId(intent)];
}

export function getRequiredFieldIds(intent: string): ResponseFieldId[] {
  return getResponsePlaybook(intent).requiredFields.map((field) => field.id);
}

export function getOptionalFieldIds(intent: string): ResponseFieldId[] {
  return getResponsePlaybook(intent).optionalFields.map((field) => field.id);
}
