// Maid Hiring Flow - Deterministic 8-step state machine
import { BaseFlow, FlowState, CollectedData, StepDefinition } from './BaseFlow';
import { isValidPhone } from '../extractors/dataExtractor';

// Known Bengaluru areas for location validation
const BENGALURU_AREAS = [
  'koramangala', 'indiranagar', 'whitefield', 'marathahalli', 'btm',
  'hsr', 'hsr layout', 'electronic city', 'jp nagar', 'jayanagar',
  'malleshwaram', 'rajajinagar', 'yeshwanthpur', 'hebbal', 'bannerghatta',
  'sarjapur', 'bellandur', 'kormangala', 'mg road', 'mgroad', 'brigade road',
  'yelahanka', 'rt nagar', 'basavanagudi', 'vijayanagar', 'banashankari',
  'sadashivanagar', 'frazer town', 'cox town', 'ulsoor', 'richmond town',
  'wilson garden', 'bommanahalli', 'begur', 'arekere', 'kudlu gate',
  'kengeri', 'nagarbhavi', 'peenya', 'dasarahalli', 'rr nagar',
  'domlur', 'hal', 'old airport road', 'cunningham road', 'residency road',
  'lavelle road', 'church street', 'majestic', 'shivajinagar', 'gandhi nagar',
  'chamrajpet', 'chickpet', 'kalasipalya', 'kr market', 'city market',
  'bangalore', 'bengaluru', 'blr',
];

// Valid service types
const SERVICE_TYPES = ['cooking', 'cleaning', 'baby care', 'babysitting', 'elderly care', 'baby', 'elderly', 'cook', 'clean', 'both'];

// Valid schedule types
const SCHEDULE_TYPES = ['24-hour live-in', '12-hour day', 'live-in', 'live in', 'full-time', 'fulltime', 'full time',
                        'part-time', 'parttime', 'part time', '24 hour', '12 hour', 'day maid', 'morning', 'evening'];

function validateLocation(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return BENGALURU_AREAS.some(area => lower.includes(area)) || lower.length >= 2;
}

function validateServiceType(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return SERVICE_TYPES.some(t => lower.includes(t));
}

function validateSchedule(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return SCHEDULE_TYPES.some(t => lower.includes(t));
}

// Optional fields accept any non-empty value
function acceptAny(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

export class MaidHiringFlow extends BaseFlow {
  defineSteps(): void {
    this.steps = [
      {
        state: FlowState.ASK_PHONE,
        slotName: 'phone',
        question: "Please share your 10-digit mobile number.",
        errorMessage: (attempts) => {
          if (attempts <= 2) return "That doesn't look like a valid 10-digit mobile number. Please share a valid number (e.g., 9876543210).";
          if (attempts === 3) return "I need your mobile number so our team can send you verified profiles. Could you please share it?";
          return "I'm having a little trouble. You can share your number now, or would you like to speak with our support team?";
        },
        required: true,
        validator: (v) => !!v && isValidPhone(v),
        nextState: FlowState.ASK_LOCATION,
      },
      {
        state: FlowState.ASK_LOCATION,
        slotName: 'location',
        question: "Which area in Bengaluru are you looking for help? (e.g., Koramangala, Indiranagar, Whitefield)",
        errorMessage: (attempts) => {
          if (attempts <= 1) return "Which area in Bengaluru do you need help? Please share your locality.";
          if (attempts === 2) return "I didn't quite get the location. Could you share the name of your colony or a nearby landmark in Bengaluru?";
          return "I'm having trouble understanding the area. You can type it one more time, or would you like to speak with our support team?";
        },
        required: true,
        validator: validateLocation,
        nextState: FlowState.ASK_SERVICE,
      },
      {
        state: FlowState.ASK_SERVICE,
        slotName: 'service_type',
        question: "What type of help do you need? Cooking / Cleaning / Baby Care / Elderly Care",
        errorMessage: (attempts) => {
          if (attempts <= 1) return "Please choose from: Cooking, Cleaning, Baby Care, or Elderly Care.";
          return "I need to know the type of help you're looking for (e.g., just 'Cook' or 'Cleaning'). Which one do you need?";
        },
        required: true,
        validator: validateServiceType,
        nextState: FlowState.ASK_SCHEDULE,
      },
      {
        state: FlowState.ASK_SCHEDULE,
        slotName: 'schedule',
        question: "Would you prefer a 24-hour Live-in maid (stays at home) or a 12-hour Day maid (morning to evening)?",
        errorMessage: (attempts) => {
          if (attempts <= 1) return "Please let us know — 24-hour Live-in maid or 12-hour Day maid?";
          return "Would you like the helper to stay at your home (24-hour) or come daily for 12 hours? Please choose one.";
        },
        required: true,
        validator: validateSchedule,
        nextState: FlowState.ASK_SALARY,
      },
      {
        state: FlowState.ASK_SALARY,
        slotName: 'salary_range',
        question: "What is your expected salary range? (Our team can also guide you on this — you can say 'skip')",
        errorMessage: "Any salary range in mind? You can also say 'skip' and our team will discuss it.",
        required: false,
        validator: acceptAny,
        nextState: FlowState.ASK_FAMILY,
      },
      {
        state: FlowState.ASK_FAMILY,
        slotName: 'family_size',
        question: "How many family members are in your household?",
        errorMessage: "How many people are in your family? (You can say 'skip' if you prefer)",
        required: false,
        validator: acceptAny,
        nextState: FlowState.ASK_EXPERIENCE,
      },
      {
        state: FlowState.ASK_EXPERIENCE,
        slotName: 'has_experience',
        question: "Have you hired a maid or domestic helper before?",
        errorMessage: "Have you had a maid before? Yes, No, or any details are fine.",
        required: false,
        validator: acceptAny,
        nextState: FlowState.COMPLETE,
      },
    ];
  }

  protected getCompletionInstruction(data: CollectedData): string {
    // Safety check: phone must always be present to complete
    if (!data.phone) {
      return `Phone number is missing. Say: "I need your 10-digit mobile number to proceed. Could you please share it?"`;
    }

    const summary = [
      `Phone: ${data.phone}`,
      data.location ? `Location: ${data.location}` : null,
      data.service_type ? `Service: ${data.service_type}` : null,
      data.schedule ? `Schedule: ${data.schedule}` : null,
      data.salary_range && data.salary_range !== 'skipped' ? `Salary: ${data.salary_range}` : null,
      data.family_size && data.family_size !== 'skipped' ? `Family: ${data.family_size}` : null,
      data.has_experience && data.has_experience !== 'skipped' ? `Experience: ${data.has_experience}` : null,
    ].filter(Boolean).join(', ');

    return `All details collected! Summary: ${summary}. Say: "Thank you! Our team will call you at ${data.phone} within 2 hours with verified profiles matching your requirements." Do NOT ask any more questions. [ESCALATE]`;
  }
}
