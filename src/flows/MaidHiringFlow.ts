// Maid Hiring Flow - For customers looking to hire
import { BaseFlow, FlowStep, SessionState } from './BaseFlow';
import { isValidPhone } from '../extractors/dataExtractor';

export class MaidHiringFlow extends BaseFlow {
  defineSteps(): void {
    this.steps = [
      {
        id: 'get_phone',
        question: "I can help you find the perfect domestic help! Please share your 10-digit mobile number.",
        dataField: 'phone',
        validator: (phone) => phone && isValidPhone(phone),
        errorMessage: "That doesn't look like a valid 10-digit mobile number. Please try again (e.g., 9876543210).",
        nextStep: 'get_location',
      },
      {
        id: 'get_location',
        question: "Great! Which area in Bengaluru are you looking for help?",
        dataField: 'location',
        validator: (loc) => loc && loc.length > 0,
        errorMessage: "Please share your locality or area in Bengaluru (e.g., Koramangala, Indiranagar).",
        nextStep: 'get_work_type',
      },
      {
        id: 'get_work_type',
        question: "What type of help do you need? (Cooking / Cleaning / Babysitting / Elderly Care)",
        dataField: 'workType',
        validator: (type) => type && type.length > 0,
        errorMessage: "Please specify the type of work (e.g., Cooking, Cleaning, or Both).",
        nextStep: 'get_requirements',
      },
      {
        id: 'get_requirements',
        question: "Would you prefer full-time or part-time help?",
        dataField: 'requirements',
        validator: (req) => req && req.length > 0,
        errorMessage: "Please let me know if you need full-time or part-time help.",
        nextStep: 'complete',
      },
    ];
  }

  protected generateCompletionMessage(state: SessionState): string {
    const { phone, location, workType, requirements } = state.collectedData;
    return `Perfect! ✅

*Your Requirements:*
• Location: ${location}
• Service: ${workType}
• Type: ${requirements}

We'll send 3 verified profiles to *${phone}* within 2 hours.

Our team will call you to discuss further details. Thank you for choosing EzyHelpers!`;
  }
}
