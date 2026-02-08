// Base Flow with State Machine Logic
export interface SessionState {
  conversationId: string;
  intent: string;
  currentStep: number;
  collectedData: {
    name?: string;
    phone?: string;
    location?: string;
    workType?: string;
    requirements?: string;
    [key: string]: any;
  };
  attempts: number;
  lastMessage: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowStep {
  id: string;
  question: string;
  dataField: string;
  validator: (value: any) => boolean;
  errorMessage: string;
  nextStep: string | ((state: SessionState) => string);
}

export abstract class BaseFlow {
  protected steps: FlowStep[] = [];
  protected completionMessage: string = '';

  constructor() {
    this.defineSteps();
  }

  abstract defineSteps(): void;

  getCurrentStep(state: SessionState): FlowStep | null {
    return this.steps[state.currentStep] || null;
  }

  processMessage(state: SessionState, message: string, extractedData: any): {
    response: string;
    shouldEscalate: boolean;
    isComplete: boolean;
    updatedState: SessionState;
  } {
    const currentStep = this.getCurrentStep(state);

    if (!currentStep) {
      return {
        response: this.completionMessage,
        shouldEscalate: true,
        isComplete: true,
        updatedState: state,
      };
    }

    // Try to extract required data
    const value = extractedData[currentStep.dataField];

    if (value && currentStep.validator(value)) {
      // Valid data - save and move to next step
      state.collectedData[currentStep.dataField] = value;
      state.currentStep++;
      state.attempts = 0;
      state.updatedAt = new Date();

      // Check if flow is complete
      const nextStep = this.getCurrentStep(state);
      if (!nextStep) {
        return {
          response: this.generateCompletionMessage(state),
          shouldEscalate: true,
          isComplete: true,
          updatedState: state,
        };
      }

      // Ask next question
      return {
        response: nextStep.question,
        shouldEscalate: false,
        isComplete: false,
        updatedState: state,
      };
    } else {
      // Invalid or missing data
      state.attempts++;

      if (state.attempts >= 3) {
        return {
          response: "I'm having trouble understanding. Let me connect you with our team. Please share your phone number.",
          shouldEscalate: true,
          isComplete: false,
          updatedState: state,
        };
      }

      return {
        response: currentStep.errorMessage || currentStep.question,
        shouldEscalate: false,
        isComplete: false,
        updatedState: state,
      };
    }
  }

  protected abstract generateCompletionMessage(state: SessionState): string;

  getProgress(state: SessionState): number {
    return (state.currentStep / this.steps.length) * 100;
  }
}
