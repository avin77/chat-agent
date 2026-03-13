import {
  detectWrongCity,
  extractExperience,
  extractFamilySize,
  extractLocation,
  extractPhone,
  extractSalaryRange,
  extractSchedule,
  extractWorkType,
  isValidPhone,
} from '../../extractors/dataExtractor.ts';
import type { AgenticFieldId } from './types.ts';

type ValidationResult = {
  accepted: boolean;
  normalizedValue?: string;
  reason?: string;
  repairPrompt: string;
};

type FieldPolicy = {
  question: string;
  allowSkip: boolean;
  validate: (value: string, message: string) => ValidationResult;
};

const SKIP_PATTERN = /^(skip|no|na|n\/a|not sure|don't know|do not know|later|pass)$/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function validatePhoneLike(value: string): ValidationResult {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (!isValidPhone(digits)) {
    return {
      accepted: false,
      reason: 'invalid_phone',
      repairPrompt: 'Please share a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
    };
  }

  return {
    accepted: true,
    normalizedValue: digits,
    repairPrompt: 'Please share a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
  };
}

function validateLocationLike(value: string, message: string): ValidationResult {
  const normalized = extractLocation(value) || extractLocation(message);
  if (!normalized) {
    const wrongCity = detectWrongCity(message);
    return {
      accepted: false,
      reason: wrongCity ? 'outside_service_area' : 'invalid_location',
      repairPrompt: wrongCity
        ? `We currently operate in Bengaluru only. Please share your area in Bengaluru.`
        : 'Please share your area in Bengaluru, such as Koramangala, Whitefield, or Indiranagar.',
    };
  }

  return {
    accepted: true,
    normalizedValue: normalized,
    repairPrompt: 'Please share your area in Bengaluru, such as Koramangala, Whitefield, or Indiranagar.',
  };
}

function validateServiceTypeLike(value: string, message: string): ValidationResult {
  const normalized = extractWorkType(value) || extractWorkType(message);
  if (!normalized) {
    return {
      accepted: false,
      reason: 'invalid_service_type',
      repairPrompt: 'Please choose the type of help you need: Cooking, Cleaning, Baby Care, or Elderly Care.',
    };
  }

  return {
    accepted: true,
    normalizedValue: normalized,
    repairPrompt: 'Please choose the type of help you need: Cooking, Cleaning, Baby Care, or Elderly Care.',
  };
}

function validateScheduleLike(value: string, message: string): ValidationResult {
  const normalized = extractSchedule(value) || extractSchedule(message);
  if (!normalized) {
    return {
      accepted: false,
      reason: 'invalid_schedule',
      repairPrompt: 'Please tell me whether you need a 24-hour live-in helper or a 12-hour day / part-time helper.',
    };
  }

  return {
    accepted: true,
    normalizedValue: normalized,
    repairPrompt: 'Please tell me whether you need a 24-hour live-in helper or a 12-hour day / part-time helper.',
  };
}

function validateOptionalText(value: string, fallbackPrompt: string): ValidationResult {
  if (SKIP_PATTERN.test(value)) {
    return {
      accepted: true,
      normalizedValue: 'skipped',
      repairPrompt: fallbackPrompt,
    };
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return {
      accepted: false,
      reason: 'empty_value',
      repairPrompt: fallbackPrompt,
    };
  }

  return {
    accepted: true,
    normalizedValue: normalized,
    repairPrompt: fallbackPrompt,
  };
}

function deriveSeverity(message: string): string | null {
  const lower = message.toLowerCase();
  if (/(stole|theft|unsafe|injured|accident|police|violence)/.test(lower)) return 'critical';
  if (/(broke|broken|damaged|urgent|serious|late|no show|didn't show)/.test(lower)) return 'high';
  if (/(issue|problem|complaint|bad service|rude)/.test(lower)) return 'medium';
  return null;
}

function deriveCallbackPreference(message: string): string | null {
  const lower = message.toLowerCase();
  const timeKeywords = /\b(evening|morning|afternoon|today|tomorrow|now|asap|anytime)\b/;
  const callKeywords = /\b(call me back|please call|call me|callback)\b/;
  
  const hasTime = timeKeywords.test(lower);
  const hasCall = callKeywords.test(lower);

  if (!hasTime && !hasCall) return null;

  if (message.length < 40) {
    return normalizeWhitespace(message);
  }

  if (hasCall) {
    const timeMatch = lower.match(timeKeywords);
    return timeMatch ? `call ${timeMatch[0]}` : 'call back';
  }

  return null;
}

function deriveIncidentTiming(message: string): string | null {
  const lower = message.toLowerCase();
  const timingKeywords = /\b(today|yesterday|last night|this morning|this evening|tomorrow)\b/;
  const match = lower.match(timingKeywords);
  
  if (!match) return null;

  if (message.length < 30) {
    return match[0];
  }

  if (/\b(happened|occurred|incident|timing|when|time)\b/.test(lower)) {
    return match[0];
  }
  
  return null;
}

function deriveAvailability(message: string): string | null {
  const normalized = extractSchedule(message);
  if (normalized) return normalized;
  if (/(available|can work|start|join)/i.test(message)) {
    return normalizeWhitespace(message);
  }
  return null;
}

const FIELD_POLICIES: Record<AgenticFieldId, FieldPolicy> = {
  phone: {
    question: 'Could you please share your 10-digit mobile number?',
    allowSkip: false,
    validate: (value) => validatePhoneLike(value),
  },
  location: {
    question: 'Which area in Bengaluru are you looking for help?',
    allowSkip: false,
    validate: (value, message) => validateLocationLike(value, message),
  },
  service_type: {
    question: 'What type of help do you need: Cooking, Cleaning, Baby Care, or Elderly Care?',
    allowSkip: false,
    validate: (value, message) => validateServiceTypeLike(value, message),
  },
  schedule: {
    question: 'Would you prefer a full-time 24-hour live-in helper or a part-time 12-hour day helper?',
    allowSkip: false,
    validate: (value, message) => validateScheduleLike(value, message),
  },
  salary_range: {
    question: 'What is your expected salary range? You can also say "skip".',
    allowSkip: true,
    validate: (value) => validateOptionalText(extractSalaryRange(value) || value, 'Please share your expected salary range or say "skip".'),
  },
  family_size: {
    question: 'How many family members are in your household? You can also say "skip".',
    allowSkip: true,
    validate: (value) => validateOptionalText(extractFamilySize(value) || value, 'Please share your household size or say "skip".'),
  },
  has_experience: {
    question: 'Have you hired a maid before? You can also say "skip".',
    allowSkip: true,
    validate: (value) => validateOptionalText(extractExperience(value) || value, 'Please tell me whether you have hired a maid before, or say "skip".'),
  },
  contact: {
    question: 'Please share the best 10-digit callback number.',
    allowSkip: false,
    validate: (value) => validatePhoneLike(value),
  },
  issue_summary: {
    question: 'Please tell me briefly what went wrong.',
    allowSkip: false,
    validate: (value) => validateOptionalText(value, 'Please tell me briefly what went wrong.'),
  },
  severity: {
    question: 'How serious is this issue: urgent, serious, or standard follow-up?',
    allowSkip: false,
    validate: (value, message) => {
      const normalized = deriveSeverity(value) || deriveSeverity(message) || normalizeWhitespace(value);
      if (!normalized) {
        return {
          accepted: false,
          reason: 'missing_severity',
          repairPrompt: 'Please tell me whether this issue is urgent, serious, or standard follow-up.',
        };
      }
      return {
        accepted: true,
        normalizedValue: normalized,
        repairPrompt: 'Please tell me whether this issue is urgent, serious, or standard follow-up.',
      };
    },
  },
  callback_preference: {
    question: 'When would you like our team to call you back?',
    allowSkip: false,
    validate: (value, message) => {
      const normalized = deriveCallbackPreference(value) || deriveCallbackPreference(message) || normalizeWhitespace(value);
      if (!normalized) {
        return {
          accepted: false,
          reason: 'missing_callback_preference',
          repairPrompt: 'Please tell me when you would like our team to call you back.',
        };
      }
      return {
        accepted: true,
        normalizedValue: normalized,
        repairPrompt: 'Please tell me when you would like our team to call you back.',
      };
    },
  },
  incident_timing: {
    question: 'When did this issue happen? You can skip this if you are unsure.',
    allowSkip: true,
    validate: (value, message) => validateOptionalText(deriveIncidentTiming(value) || deriveIncidentTiming(message) || value, 'Please tell me when this happened, or say "skip".'),
  },
  role_service_offered: {
    question: 'What kind of work do you do: Cooking, Cleaning, Baby Care, or Elderly Care?',
    allowSkip: false,
    validate: (value, message) => validateServiceTypeLike(value, message),
  },
  experience: {
    question: 'How much experience do you have in this work?',
    allowSkip: false,
    validate: (value) => {
      const normalized = extractExperience(value) || normalizeWhitespace(value);
      if (!normalized) {
        return {
          accepted: false,
          reason: 'missing_experience',
          repairPrompt: 'Please share your experience briefly, such as years or the type of work you have done.',
        };
      }
      return {
        accepted: true,
        normalizedValue: normalized,
        repairPrompt: 'Please share your experience briefly, such as years or the type of work you have done.',
      };
    },
  },
  availability_window: {
    question: 'When are you available to work: full-time, part-time, live-in, or a specific shift?',
    allowSkip: false,
    validate: (value, message) => {
      const normalized = deriveAvailability(value) || deriveAvailability(message) || normalizeWhitespace(value);
      if (!normalized) {
        return {
          accepted: false,
          reason: 'missing_availability',
          repairPrompt: 'Please tell me when you are available to work, such as full-time, part-time, live-in, or a specific shift.',
        };
      }
      return {
        accepted: true,
        normalizedValue: normalized,
        repairPrompt: 'Please tell me when you are available to work, such as full-time, part-time, live-in, or a specific shift.',
      };
    },
  },
  preferred_areas: {
    question: 'Which Bengaluru areas would you prefer to work in?',
    allowSkip: false,
    validate: (value, message) => validateLocationLike(value, message),
  },
};

export const AGENTIC_TOOLS = FIELD_POLICIES;

export function getFieldQuestion(field: AgenticFieldId): string {
  return FIELD_POLICIES[field].question;
}

export function validateSlotCandidate(field: AgenticFieldId, value: string, message: string): ValidationResult {
  return FIELD_POLICIES[field].validate(value, message);
}

export function canSkipField(field: AgenticFieldId): boolean {
  return FIELD_POLICIES[field].allowSkip;
}

export function detectExplicitInvalidPhone(message: string): string | null {
  const match = message.match(/\b\d{5,9}\b/);
  return match ? match[0] : null;
}

export function extractFieldValue(field: AgenticFieldId, message: string): string | null {
  switch (field) {
    case 'phone':
    case 'contact':
      return extractPhone(message);
    case 'location':
    case 'preferred_areas':
      return extractLocation(message);
    case 'service_type':
    case 'role_service_offered':
      return extractWorkType(message);
    case 'schedule':
    case 'availability_window':
      return extractSchedule(message) || deriveAvailability(message);
    case 'salary_range':
      return extractSalaryRange(message);
    case 'family_size':
      return extractFamilySize(message);
    case 'has_experience':
    case 'experience':
      return extractExperience(message);
    case 'severity':
      return deriveSeverity(message);
    case 'callback_preference':
      return deriveCallbackPreference(message);
    case 'incident_timing':
      return deriveIncidentTiming(message);
    case 'issue_summary':
      return normalizeWhitespace(message);
    default:
      return null;
  }
}
