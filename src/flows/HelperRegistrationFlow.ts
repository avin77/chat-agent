// Helper Registration Flow - For people looking for work
// NOTE: Currently not used in route.ts (helper_reg uses LLM-only flow)
// This exists for future state machine integration of helper registration.
import { BaseFlow, FlowState, CollectedData } from './BaseFlow';
import { isValidPhone } from '../extractors/dataExtractor';

export class HelperRegistrationFlow extends BaseFlow {
  defineSteps(): void {
    this.steps = [
      {
        state: FlowState.ASK_PHONE,
        slotName: 'phone',
        question: "Thank you! Please share your 10-digit mobile number.",
        errorMessage: "Please provide a valid 10-digit mobile number (e.g., 9876543210).",
        required: true,
        validator: (phone) => !!phone && isValidPhone(phone),
        nextState: FlowState.ASK_SERVICE,
      },
      {
        state: FlowState.ASK_SERVICE,
        slotName: 'service_type',
        question: "What kind of work do you do? (Cooking / Cleaning / Babysitting / Elderly Care)",
        errorMessage: "Please tell us what type of work you can do.",
        required: true,
        validator: (type) => !!type && type.length > 0,
        nextState: FlowState.ASK_LOCATION,
      },
      {
        state: FlowState.ASK_LOCATION,
        slotName: 'location',
        question: "Which areas in Bengaluru can you work in?",
        errorMessage: "Please share the areas where you can work.",
        required: true,
        validator: (loc) => !!loc && loc.length > 0,
        nextState: FlowState.COMPLETE,
      },
    ];
  }

  protected getCompletionInstruction(data: CollectedData): string {
    return `Helper registered. Say: "Thank you! We have registered your number ${data.phone}. We'll verify your details and call you within 24 hours to help you find work. Welcome to EzyHelpers!" [ESCALATE]`;
  }
}
