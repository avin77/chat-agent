// Helper Registration Flow - For people looking for work
import { BaseFlow, FlowStep, SessionState } from './BaseFlow';
import { isValidPhone } from '../extractors/dataExtractor';

export class HelperRegistrationFlow extends BaseFlow {
  defineSteps(): void {
    this.steps = [
      {
        id: 'get_name',
        question: "Welcome! We'd love to help you find work. What's your name?",
        dataField: 'name',
        validator: (name) => name && name.length >= 2,
        errorMessage: "Please share your name.",
        nextStep: 'get_phone',
      },
      {
        id: 'get_phone',
        question: "Thank you! Please share your 10-digit mobile number.",
        dataField: 'phone',
        validator: (phone) => phone && isValidPhone(phone),
        errorMessage: "Please provide a valid 10-digit mobile number (e.g., 9876543210).",
        nextStep: 'get_work_type',
      },
      {
        id: 'get_work_type',
        question: "What kind of work do you do? (Cooking / Cleaning / Babysitting / Elderly Care)",
        dataField: 'workType',
        validator: (type) => type && type.length > 0,
        errorMessage: "Please tell us what type of work you can do (e.g., Cooking, Cleaning).",
        nextStep: 'get_location',
      },
      {
        id: 'get_location',
        question: "Which areas in Bengaluru can you work in?",
        dataField: 'location',
        validator: (loc) => loc && loc.length > 0,
        errorMessage: "Please share the areas where you can work (e.g., Koramangala, HSR Layout).",
        nextStep: 'complete',
      },
    ];
  }

  protected generateCompletionMessage(state: SessionState): string {
    const { name, phone, workType, location } = state.collectedData;
    return `Thank you, ${name}! ✅

*Your Profile:*
• Name: ${name}
• Phone: ${phone}
• Skills: ${workType}
• Areas: ${location}

We'll verify your details and call you within 24 hours to help you find work. Welcome to EzyHelpers!`;
  }
}
