// Complaint Flow - Urgent escalation
// NOTE: Currently not used in route.ts (complaint uses LLM-only flow)
// This exists for future state machine integration of complaint handling.
import { BaseFlow, FlowState, CollectedData } from './BaseFlow';
import { isValidPhone } from '../extractors/dataExtractor';

export class ComplaintFlow extends BaseFlow {
  defineSteps(): void {
    this.steps = [
      {
        state: FlowState.ASK_PHONE,
        slotName: 'phone',
        question: "I'm sorry to hear about this issue. Let me escalate this to our priority team immediately. Please share your mobile number so they can call you.",
        errorMessage: "Please provide your 10-digit mobile number so our team can reach you urgently.",
        required: true,
        validator: (phone) => !!phone && isValidPhone(phone),
        nextState: FlowState.COMPLETE,
      },
    ];
  }

  protected getCompletionInstruction(data: CollectedData): string {
    return `Complaint escalated. Say: "Our priority support team will call you at ${data.phone} within 1 hour to resolve your issue. We apologize for the inconvenience." [ESCALATE]`;
  }
}
