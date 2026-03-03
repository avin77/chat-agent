// Base Flow with Deterministic State Machine Logic

// ─── State Enum ──────────────────────────────────────────────────────────────
export enum FlowState {
  START = 'START',
  ASK_PHONE = 'ASK_PHONE',
  ASK_LOCATION = 'ASK_LOCATION',
  ASK_SERVICE = 'ASK_SERVICE',
  ASK_SCHEDULE = 'ASK_SCHEDULE',
  ASK_SALARY = 'ASK_SALARY',
  ASK_FAMILY = 'ASK_FAMILY',
  ASK_EXPERIENCE = 'ASK_EXPERIENCE',
  COMPLETE = 'COMPLETE',
}

// ─── Failure Types ───────────────────────────────────────────────────────────
export enum FailureType {
  NONE = 'NONE',
  INVALID_SLOT = 'INVALID_SLOT',
  FAQ_MID_FLOW = 'FAQ_MID_FLOW',
  WRONG_CITY = 'WRONG_CITY',
  OFF_TOPIC = 'OFF_TOPIC',
  MULTI_INTENT = 'MULTI_INTENT',
  SLOT_SKIP = 'SLOT_SKIP',
  BACKTRACK = 'BACKTRACK',
  GIBBERISH = 'GIBBERISH',
  MULTI_SLOT = 'MULTI_SLOT',
}

// ─── Collected Data ──────────────────────────────────────────────────────────
// NOTE: __confusion is a reserved internal key stored in collected_data.
// Value is a string number (e.g. "0", "1", "2") representing consecutive
// off-topic messages in the current state. Prefixed with __ to distinguish
// from lead fields. Reset to "0" on successful slot collection.
// MaidHiringFlow.ts does not need to know about this key — it is managed
// in route.ts and stored via the existing index signature [key: string]: string | undefined.
export interface CollectedData {
  name?: string;
  phone?: string;
  location?: string;
  service_type?: string;
  schedule?: string;
  salary_range?: string;
  family_size?: string;
  has_experience?: string;
  [key: string]: string | undefined;
}

// ─── Session State ───────────────────────────────────────────────────────────
export interface SessionState {
  conversationId: string;
  intent: string;
  currentState: FlowState;
  collectedData: CollectedData;
  attempts: number;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Step Definition ─────────────────────────────────────────────────────────
export interface StepDefinition {
  state: FlowState;
  slotName: keyof CollectedData;
  question: string;
  errorMessage: string | ((attempts: number) => string);
  required: boolean;
  validator: (value: string | null | undefined) => boolean;
  nextState: FlowState;
}

// ─── Process Result ──────────────────────────────────────────────────────────
export interface ProcessResult {
  newState: FlowState;
  collectedData: CollectedData;
  failureType: FailureType;
  slotsExtracted: Record<string, string>;
  shouldAdvance: boolean;
  shouldEscalate: boolean;
  isComplete: boolean;
  // Prompt instruction for LLM (narrow, not open-ended)
  llmInstruction: string;
  // For FAQ mid-flow: the FAQ answer preamble + re-ask
  faqQuestion?: string;
  attempts: number;
}

// ─── Base Flow ───────────────────────────────────────────────────────────────
export abstract class BaseFlow {
  protected steps: StepDefinition[] = [];

  constructor() {
    this.defineSteps();
  }

  abstract defineSteps(): void;

  // Get the step definition for a given state
  getStepForState(state: FlowState): StepDefinition | null {
    return this.steps.find(s => s.state === state) || null;
  }

  // Get the ordered list of states
  getStateOrder(): FlowState[] {
    return this.steps.map(s => s.state);
  }

  // Find the next unfilled required step after extracting multiple slots
  findNextUnfilledStep(collectedData: CollectedData): FlowState {
    for (const step of this.steps) {
      const value = collectedData[step.slotName];
      if (!value || (step.required && !step.validator(value))) {
        return step.state;
      }
    }
    return FlowState.COMPLETE;
  }

  // Process a user message against the current state
  processMessage(
    session: SessionState,
    userMessage: string,
    extractedSlots: Record<string, string | null>,
    faqDetected: string | null,
    wrongCity: string | null,
    isGibberish: boolean,
    backtrackSlot: string | null,
  ): ProcessResult {
    // ─── START state auto-advances to ASK_PHONE ──────────────────────────────
    if (session.currentState === FlowState.START) {
      // But first check for wrong city
      if (wrongCity) {
        return {
          newState: FlowState.ASK_PHONE,
          collectedData: session.collectedData,
          failureType: FailureType.WRONG_CITY,
          slotsExtracted: {},
          shouldAdvance: false,
          shouldEscalate: false,
          isComplete: false,
          llmInstruction: `User mentioned ${wrongCity}. Say: "We currently operate in Bengaluru only. We're expanding soon — share your number and we'll reach out once we launch in your city!" Then ask for their 10-digit mobile number.`,
          attempts: 0,
        };
      }

      // Check if user provided multiple slots upfront
      const newCollected = { ...session.collectedData };
      const slotsFound: Record<string, string> = {};
      for (const step of this.steps) {
        const value = extractedSlots[step.slotName];
        if (value && step.validator(value)) {
          newCollected[step.slotName] = value;
          slotsFound[step.slotName] = value;
        }
      }

      // Also passively extract name
      if (extractedSlots.name && !newCollected.name) {
        newCollected.name = extractedSlots.name;
        slotsFound.name = extractedSlots.name;
      }

      const slotCount = Object.keys(slotsFound).filter(k => k !== 'name').length;

      if (slotCount > 1) {
        // Multi-slot: jump to next unfilled
        let nextState = this.findNextUnfilledStep(newCollected);

        // Safety: if no phone, redirect to ASK_PHONE
        if (!newCollected.phone && nextState !== FlowState.ASK_PHONE) {
          nextState = FlowState.ASK_PHONE;
        }

        const nextStep = this.getStepForState(nextState);
        return {
          newState: nextState,
          collectedData: newCollected,
          failureType: FailureType.MULTI_SLOT,
          slotsExtracted: slotsFound,
          shouldAdvance: true,
          shouldEscalate: nextState === FlowState.COMPLETE,
          isComplete: nextState === FlowState.COMPLETE,
          llmInstruction: nextState === FlowState.COMPLETE
            ? this.getCompletionInstruction(newCollected)
            : `User provided multiple details: ${Object.entries(slotsFound).map(([k,v]) => `${k}=${v}`).join(', ')}. Acknowledge all of them briefly. Then ask: "${nextStep!.question}"`,
          attempts: 0,
        };
      }

      if (slotCount === 1) {
        // Single slot from START — if it's phone, advance to ASK_LOCATION
        const nextState = this.findNextUnfilledStep(newCollected);
        const nextStep = this.getStepForState(nextState);
        return {
          newState: nextState,
          collectedData: newCollected,
          failureType: FailureType.NONE,
          slotsExtracted: slotsFound,
          shouldAdvance: true,
          shouldEscalate: false,
          isComplete: false,
          llmInstruction: `User provided ${Object.keys(slotsFound).join(', ')}. Acknowledge it. Then ask: "${nextStep!.question}"`,
          attempts: 0,
        };
      }

      // FAQ at START
      if (faqDetected) {
        return {
          newState: FlowState.ASK_PHONE,
          collectedData: session.collectedData,
          failureType: FailureType.FAQ_MID_FLOW,
          slotsExtracted: {},
          shouldAdvance: false,
          shouldEscalate: false,
          isComplete: false,
          llmInstruction: `User asked a FAQ: "${faqDetected}". Answer it briefly using EzyHelpers knowledge. Then say: "To get started, please share your 10-digit mobile number."`,
          faqQuestion: faqDetected,
          attempts: 0,
        };
      }

      // Normal START → advance to ASK_PHONE
      return {
        newState: FlowState.ASK_PHONE,
        collectedData: session.collectedData,
        failureType: FailureType.NONE,
        slotsExtracted: {},
        shouldAdvance: false,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User wants to hire domestic help. Say something welcoming and ask: "Please share your 10-digit mobile number."`,
        attempts: 0,
      };
    }

    const currentStep = this.getStepForState(session.currentState);

    // Already complete
    if (session.currentState === FlowState.COMPLETE || !currentStep) {
      return {
        newState: FlowState.COMPLETE,
        collectedData: session.collectedData,
        failureType: FailureType.NONE,
        slotsExtracted: {},
        shouldAdvance: false,
        shouldEscalate: true,
        isComplete: true,
        llmInstruction: this.getCompletionInstruction(session.collectedData),
        attempts: session.attempts,
      };
    }

    // ─── Handle backtrack request ────────────────────────────────────────────
    if (backtrackSlot) {
      const targetStep = this.steps.find(s => s.slotName === backtrackSlot);
      if (targetStep) {
        const newCollected = { ...session.collectedData };
        delete newCollected[backtrackSlot];
        return {
          newState: targetStep.state,
          collectedData: newCollected,
          failureType: FailureType.BACKTRACK,
          slotsExtracted: {},
          shouldAdvance: false,
          shouldEscalate: false,
          isComplete: false,
          llmInstruction: `User wants to change their ${backtrackSlot}. Say "Sure, no problem!" and ask: "${targetStep.question}"`,
          attempts: 0,
        };
      }
    }

    // ─── Handle gibberish ────────────────────────────────────────────────────
    if (isGibberish) {
      return {
        newState: session.currentState,
        collectedData: session.collectedData,
        failureType: FailureType.GIBBERISH,
        slotsExtracted: {},
        shouldAdvance: false,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User sent gibberish/unclear text. Say "I didn't catch that." Then re-ask: "${currentStep.question}"`,
        attempts: session.attempts + 1,
      };
    }

    // ─── Handle wrong city ───────────────────────────────────────────────────
    if (wrongCity) {
      return {
        newState: session.currentState,
        collectedData: session.collectedData,
        failureType: FailureType.WRONG_CITY,
        slotsExtracted: {},
        shouldAdvance: false,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User mentioned ${wrongCity}. Say: "We currently operate in Bengaluru only. We're expanding soon — share your number and we'll reach out when we're in your city!" Stay on current question.`,
        attempts: session.attempts,
      };
    }

    // ─── Try to extract ALL slots from this message (multi-slot support) ─────
    const newCollected = { ...session.collectedData };
    const slotsFound: Record<string, string> = {};

    for (const step of this.steps) {
      // Skip already-collected slots
      if (newCollected[step.slotName]) continue;
      const value = extractedSlots[step.slotName];
      if (value && step.validator(value)) {
        newCollected[step.slotName] = value;
        slotsFound[step.slotName] = value;
      }
    }

    // Passively extract name
    if (extractedSlots.name && !newCollected.name) {
      newCollected.name = extractedSlots.name;
      slotsFound.name = extractedSlots.name;
    }

    const slotCount = Object.keys(slotsFound).filter(k => k !== 'name').length;

    // ─── Handle FAQ mid-flow ─────────────────────────────────────────────────
    // FAQ always takes priority — user is asking a question, not providing slot values
    if (faqDetected) {
      return {
        newState: session.currentState,
        collectedData: session.collectedData,
        failureType: FailureType.FAQ_MID_FLOW,
        slotsExtracted: {},
        shouldAdvance: false,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User asked a FAQ: "${faqDetected}". Answer it briefly. Then re-ask: "${currentStep.question}"`,
        faqQuestion: faqDetected,
        attempts: session.attempts,
      };
    }

    // ─── Multi-slot extraction ───────────────────────────────────────────────
    if (slotCount > 1) {
      const nextState = this.findNextUnfilledStep(newCollected);
      const nextStep = this.getStepForState(nextState);
      return {
        newState: nextState,
        collectedData: newCollected,
        failureType: FailureType.MULTI_SLOT,
        slotsExtracted: slotsFound,
        shouldAdvance: true,
        shouldEscalate: nextState === FlowState.COMPLETE,
        isComplete: nextState === FlowState.COMPLETE,
        llmInstruction: nextState === FlowState.COMPLETE
          ? this.getCompletionInstruction(newCollected)
          : `User provided: ${Object.entries(slotsFound).map(([k,v]) => `${k}=${v}`).join(', ')}. Acknowledge briefly. Then ask: "${nextStep!.question}"`,
        attempts: 0,
      };
    }

    // ─── Single slot extraction (normal flow) ────────────────────────────────
    const currentSlotValue = extractedSlots[currentStep.slotName];

    if (currentSlotValue && currentStep.validator(currentSlotValue)) {
      // Valid slot — advance
      newCollected[currentStep.slotName] = currentSlotValue;
      const nextState = currentStep.nextState;
      const nextStep = this.getStepForState(nextState);

      if (nextState === FlowState.COMPLETE || !nextStep) {
        // Safety check: ensure phone is present before completing
        if (!newCollected.phone) {
          return {
            newState: FlowState.ASK_PHONE,
            collectedData: newCollected,
            failureType: FailureType.NONE,
            slotsExtracted: { [currentStep.slotName]: currentSlotValue },
            shouldAdvance: true,
            shouldEscalate: false,
            isComplete: false,
            llmInstruction: `User provided ${currentStep.slotName}: "${currentSlotValue}". Acknowledge it. But first, we need a phone number. Ask: "Could you please share your 10-digit mobile number?"`,
            attempts: 0,
          };
        }

        return {
          newState: FlowState.COMPLETE,
          collectedData: newCollected,
          failureType: FailureType.NONE,
          slotsExtracted: { [currentStep.slotName]: currentSlotValue },
          shouldAdvance: true,
          shouldEscalate: true,
          isComplete: true,
          llmInstruction: this.getCompletionInstruction(newCollected),
          attempts: 0,
        };
      }

      return {
        newState: nextState,
        collectedData: newCollected,
        failureType: FailureType.NONE,
        slotsExtracted: { [currentStep.slotName]: currentSlotValue },
        shouldAdvance: true,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User provided ${currentStep.slotName}: "${currentSlotValue}". Acknowledge it briefly. Then ask: "${nextStep.question}"`,
        attempts: 0,
      };
    }

    // ─── Handle "skip" for optional fields ───────────────────────────────────
    const isSkip = /^(skip|no|nah|pass|not sure|don'?t know|no preference|na|n\/a)$/i.test(userMessage.trim());
    if (isSkip && !currentStep.required) {
      newCollected[currentStep.slotName] = 'skipped';
      const nextState = currentStep.nextState;
      const nextStep = this.getStepForState(nextState);

      // Safety: if no phone yet, don't complete
      if ((nextState === FlowState.COMPLETE || !nextStep) && !newCollected.phone) {
        return {
          newState: FlowState.ASK_PHONE,
          collectedData: newCollected,
          failureType: FailureType.SLOT_SKIP,
          slotsExtracted: { [currentStep.slotName]: 'skipped' },
          shouldAdvance: true,
          shouldEscalate: false,
          isComplete: false,
          llmInstruction: `User skipped ${currentStep.slotName}. That's fine! But we need your phone number. Ask: "Could you please share your 10-digit mobile number?"`,
          attempts: 0,
        };
      }

      if (nextState === FlowState.COMPLETE || !nextStep) {
        return {
          newState: FlowState.COMPLETE,
          collectedData: newCollected,
          failureType: FailureType.SLOT_SKIP,
          slotsExtracted: { [currentStep.slotName]: 'skipped' },
          shouldAdvance: true,
          shouldEscalate: true,
          isComplete: true,
          llmInstruction: this.getCompletionInstruction(newCollected),
          attempts: 0,
        };
      }

      return {
        newState: nextState,
        collectedData: newCollected,
        failureType: FailureType.SLOT_SKIP,
        slotsExtracted: { [currentStep.slotName]: 'skipped' },
        shouldAdvance: true,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User skipped ${currentStep.slotName}. That's okay. Ask: "${nextStep.question}"`,
        attempts: 0,
      };
    }

    // ─── For optional fields, accept any non-empty text ──────────────────────
    if (!currentStep.required && userMessage.trim().length > 0 && !faqDetected && !isGibberish) {
      newCollected[currentStep.slotName] = userMessage.trim();
      const nextState = currentStep.nextState;
      const nextStep = this.getStepForState(nextState);

      if (nextState === FlowState.COMPLETE || !nextStep) {
        return {
          newState: FlowState.COMPLETE,
          collectedData: newCollected,
          failureType: FailureType.NONE,
          slotsExtracted: { [currentStep.slotName]: userMessage.trim() },
          shouldAdvance: true,
          shouldEscalate: true,
          isComplete: true,
          llmInstruction: this.getCompletionInstruction(newCollected),
          attempts: 0,
        };
      }

      return {
        newState: nextState,
        collectedData: newCollected,
        failureType: FailureType.NONE,
        slotsExtracted: { [currentStep.slotName]: userMessage.trim() },
        shouldAdvance: true,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User said: "${userMessage.trim()}" for ${currentStep.slotName}. Acknowledge it. Then ask: "${nextStep.question}"`,
        attempts: 0,
      };
    }

    // ─── Skip attempt for required fields ────────────────────────────────────
    if (isSkip && currentStep.required) {
      return {
        newState: session.currentState,
        collectedData: session.collectedData,
        failureType: FailureType.SLOT_SKIP,
        slotsExtracted: {},
        shouldAdvance: false,
        shouldEscalate: false,
        isComplete: false,
        llmInstruction: `User tried to skip ${currentStep.slotName}, but it's required. Say: "This information is needed to find you the right match." Then re-ask: "${currentStep.question}"`,
        attempts: session.attempts + 1,
      };
    }

    // ─── Invalid or missing slot value ───────────────────────────────────────
    // Check off-topic (no slot extracted, no FAQ, not gibberish)
    if (!faqDetected && !isGibberish && slotCount === 0 && !currentSlotValue) {
      // Could be off-topic or just didn't match
      const isOffTopic = userMessage.trim().length > 3 &&
        !extractedSlots[currentStep.slotName];

      if (isOffTopic && session.currentState !== FlowState.ASK_SALARY &&
          session.currentState !== FlowState.ASK_FAMILY &&
          session.currentState !== FlowState.ASK_EXPERIENCE) {
        return {
          newState: session.currentState,
          collectedData: session.collectedData,
          failureType: FailureType.OFF_TOPIC,
          slotsExtracted: {},
          shouldAdvance: false,
          shouldEscalate: false,
          isComplete: false,
          llmInstruction: `User said something off-topic: "${userMessage}". Say "I can help with domestic help services." Then re-ask: "${currentStep.question}"`,
          attempts: session.attempts + 1,
        };
      }
    }

    // Default: invalid slot
    const errorMsg = typeof currentStep.errorMessage === 'function'
      ? currentStep.errorMessage(session.attempts + 1)
      : currentStep.errorMessage;

    return {
      newState: session.currentState,
      collectedData: session.collectedData,
      failureType: FailureType.INVALID_SLOT,
      slotsExtracted: {},
      shouldAdvance: false,
      shouldEscalate: false,
      isComplete: false,
      llmInstruction: `User input didn't contain valid ${currentStep.slotName}. Say: "${errorMsg}"`,
      attempts: session.attempts + 1,
    };
  }

  // Too many attempts → escalate
  shouldForceEscalate(attempts: number): boolean {
    return attempts >= 3;
  }

  // Get progress percentage
  getProgress(state: FlowState): number {
    const order = this.getStateOrder();
    const idx = order.indexOf(state);
    if (idx === -1) return 100;
    return Math.round((idx / order.length) * 100);
  }

  // Abstract: completion instruction for LLM
  protected abstract getCompletionInstruction(data: CollectedData): string;
}

// ─── Helper: Create fresh session state ──────────────────────────────────────
export function createSessionState(conversationId: string, intent: string): SessionState {
  return {
    conversationId,
    intent,
    currentState: FlowState.START,
    collectedData: {},
    attempts: 0,
    lastMessage: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
