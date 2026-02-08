// Complaint Flow - Urgent escalation
import { BaseFlow, FlowStep, SessionState } from './BaseFlow';
import { isValidPhone } from '../extractors/dataExtractor';

export class ComplaintFlow extends BaseFlow {
  defineSteps(): void {
    this.steps = [
      {
        id: 'get_phone',
        question: "I'm sorry to hear about this issue. Let me escalate this to our priority team immediately. Please share your mobile number so they can call you.",
        dataField: 'phone',
        validator: (phone) => phone && isValidPhone(phone),
        errorMessage: "Please provide your 10-digit mobile number so our team can reach you urgently.",
        nextStep: 'complete',
      },
    ];
  }

  protected generateCompletionMessage(state: SessionState): string {
    const { phone } = state.collectedData;
    return `🚨 *Urgent - Escalated*

Our priority support team will call you at *${phone}* within 1 hour to resolve your issue.

Ticket Number: #${Date.now().toString().slice(-6)}

We apologize for the inconvenience and will make this right.`;
  }
}
