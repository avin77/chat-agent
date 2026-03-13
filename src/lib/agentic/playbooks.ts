import {
  getResponsePlaybook,
  normalizeIntentId,
  type CanonicalIntentId,
} from '../responsePlaybooks.ts';
import type { AgenticFieldId, IntentPlaybook } from './types.ts';

const AGENTIC_FIELD_ORDERS: Record<CanonicalIntentId, AgenticFieldId[]> = {
  maid_hire: [
    'phone',
    'location',
    'service_type',
    'schedule',
    'salary_range',
    'family_size',
    'has_experience',
  ],
  complaint: [
    'contact',
    'issue_summary',
    'severity',
    'callback_preference',
    'incident_timing',
  ],
  maid_registration: [
    'contact',
    'role_service_offered',
    'experience',
    'availability_window',
    'preferred_areas',
  ],
  general: [],
};

const AGENTIC_STATE_MAP: Record<CanonicalIntentId, Partial<Record<AgenticFieldId, string>>> = {
  maid_hire: {
    phone: 'ASK_PHONE',
    location: 'ASK_LOCATION',
    service_type: 'ASK_SERVICE',
    schedule: 'ASK_SCHEDULE',
    salary_range: 'ASK_SALARY',
    family_size: 'ASK_FAMILY',
    has_experience: 'ASK_EXPERIENCE',
  },
  complaint: {
    contact: 'ASK_CONTACT',
    issue_summary: 'ASK_ISSUE_SUMMARY',
    severity: 'ASK_SEVERITY',
    callback_preference: 'ASK_CALLBACK_PREFERENCE',
    incident_timing: 'ASK_INCIDENT_TIMING',
  },
  maid_registration: {
    contact: 'ASK_CONTACT',
    role_service_offered: 'ASK_ROLE_SERVICE',
    experience: 'ASK_EXPERIENCE',
    availability_window: 'ASK_AVAILABILITY',
    preferred_areas: 'ASK_PREFERRED_AREAS',
  },
  general: {},
};

function toRuntimePlaybook(intent: CanonicalIntentId): IntentPlaybook {
  const playbook = getResponsePlaybook(intent);
  const requiredFields = playbook.requiredFields.map((field) => field.id);
  const optionalFields = playbook.optionalFields.map((field) => field.id);

  return {
    intent,
    displayName: playbook.displayName,
    supportedFields: [...requiredFields, ...optionalFields],
    requiredFields,
    optionalFields,
    fieldOrder: AGENTIC_FIELD_ORDERS[intent],
    fieldStateMap: AGENTIC_STATE_MAP[intent],
    completionState: 'COMPLETE',
    allowSuspend: true,
    answerFirst: Boolean(playbook.answerFirstPolicy),
    entryConfirmation: playbook.entryConfirmation,
    completionConfirmation: playbook.completionConfirmation,
  };
}

export const AGENTIC_PLAYBOOKS: Record<CanonicalIntentId, IntentPlaybook> = {
  maid_hire: toRuntimePlaybook('maid_hire'),
  complaint: toRuntimePlaybook('complaint'),
  maid_registration: toRuntimePlaybook('maid_registration'),
  general: toRuntimePlaybook('general'),
};

export function getPlaybook(intent: string): IntentPlaybook {
  return AGENTIC_PLAYBOOKS[normalizeIntentId(intent)];
}
