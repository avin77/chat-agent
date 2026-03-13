import {
  detectFAQ,
  detectWrongCity,
  extractName,
} from '../../extractors/dataExtractor.ts';
import {
  normalizeIntentId,
  type CanonicalIntentId,
} from '../responsePlaybooks.ts';
import { normalizeServicePhrase } from '../serviceVocabulary.ts';
import { AgentPlanner } from './planner.ts';
import { AGENTIC_PLAYBOOKS, getPlaybook } from './playbooks.ts';
import {
  canSkipField,
  detectExplicitInvalidPhone,
  extractFieldValue,
  getFieldQuestion,
  validateSlotCandidate,
} from './toolRegistry.ts';
import type {
  AcceptedSlotDecision,
  AgenticDecision,
  AgenticFieldId,
  AgenticIntentSnapshot,
  AgenticSessionSnapshot,
  AgenticTurnInput,
  RejectedSlotDecision,
  SlotCandidate,
} from './types.ts';

function detectIntent(message: string): CanonicalIntentId {
  const lower = message.toLowerCase();

  const hasHireIntent =
    /need.*maid|hire.*maid|looking for.*maid|want.*maid|need.*cook|hire.*cook|need.*cleaning|hire.*help|book.*maid|get.*maid|i need a maid|need domestic help|need.*helper|looking for.*helper|want.*helper|full.?time.*cook|part.?time.*cook/.test(lower);
  const hasComplaintIntent =
    /complaint|issue|problem|angry|upset|bad service|broke|broken|damaged|didn't show|didn't come|not working|rude|misbehav|stole|theft|missing|late|no show/.test(lower);
  const hasRegistrationIntent =
    /need.*job|want.*work|looking for.*job|looking for work|register.*helper|register.*maid|register.*cook|helper registration/.test(lower) ||
    /\bi am(?:\s+a)?\s+(cook|maid|helper)\b/.test(lower);

  if (hasHireIntent) {
    return 'maid_hire';
  }
  if (hasComplaintIntent) {
    return 'complaint';
  }
  if (hasRegistrationIntent) {
    return 'maid_registration';
  }

  return 'general';
}

function normalizeSnapshot(snapshot: AgenticIntentSnapshot): AgenticIntentSnapshot {
  return {
    ...snapshot,
    intent: normalizeIntentId(snapshot.intent),
    collectedData: { ...snapshot.collectedData },
    slotAttempts: { ...snapshot.slotAttempts },
  };
}

function nextMissingField(intent: CanonicalIntentId, collectedData: Record<string, string>): AgenticFieldId | null {
  const playbook = getPlaybook(intent);
  for (const field of playbook.fieldOrder) {
    if (!playbook.requiredFields.includes(field)) {
      continue;
    }
    const value = collectedData[field];
    if (!value || value.trim().length === 0) {
      return field;
    }
  }
  return null;
}

function mapStateForField(intent: CanonicalIntentId, field: AgenticFieldId | null): string {
  if (!field) {
    return AGENTIC_PLAYBOOKS[intent].completionState;
  }

  return AGENTIC_PLAYBOOKS[intent].fieldStateMap[field] || `ASK_${field.toUpperCase()}`;
}

function buildFaqAnswer(intent: CanonicalIntentId, message: string): string | null {
  const wrongCity = detectWrongCity(message);
  const lower = message.toLowerCase();
  const looksLikeQuestion =
    /\?/.test(message) ||
    /^(do|does|can|is|are|what|which|how|have|will|would|could|do u|tell me)/i.test(lower.trim());

  if (wrongCity) {
    return 'We currently provide services only in Bengaluru.';
  }

  const topic = detectFAQ(message);
  const normalizedService = normalizeServicePhrase(message);

  switch (topic) {
    case 'Do you have 24hr/full-time/live-in maids?':
      return 'Yes, we provide 24-hour full-time live-in helpers in Bengaluru.';
    case 'What are the prices/costs?':
      return 'Our team will discuss pricing when they call you.';
    case 'What services do you offer?':
      return 'We provide Cooking, Cleaning, Baby Care, and Elderly Care support in Bengaluru.';
    case 'How does the process work?':
      return 'We collect your requirement, shortlist verified profiles, and our team calls you to confirm the match.';
    case 'Are helpers background verified?':
      return 'Yes, our helpers are background verified and police-checked.';
    case 'Are your services safe and reliable?':
      return 'Yes, we work with verified helpers and our team supports the matching process in Bengaluru.';
    default:
      break;
  }

  if (!looksLikeQuestion) {
    return null;
  }

  if (/\b24\s*(?:h|hr|hrs|hour|hours|hurs)\b/.test(lower) || /live[\s-]?in|full[\s-]?time/.test(lower)) {
    return 'Yes, we provide 24-hour full-time live-in helpers in Bengaluru.';
  }

  if (/(background|verify|verified|police|check|trust)/.test(lower)) {
    return 'Yes, our helpers are background verified and police-checked.';
  }

  if (/(price|cost|charge|rate|salary|kitna|budget)/.test(lower)) {
    return 'Our team will discuss pricing when they call you.';
  }

  if (normalizedService && /(\?|service|servise|provide|have|offer|do u|do you|hav)/.test(lower)) {
    return `Yes, we provide ${normalizedService.toLowerCase()} support in Bengaluru.`;
  }

  return intent === 'general'
    ? null
    : 'I can answer that briefly and continue with your request.';
}

function extractCandidatesForIntent(intent: CanonicalIntentId, message: string): SlotCandidate[] {
  const playbook = getPlaybook(intent);
  const candidates: SlotCandidate[] = [];

  for (const field of playbook.fieldOrder) {
    const value = extractFieldValue(field, message);
    if (value) {
      candidates.push({
        intent,
        field,
        value,
        source: 'regex',
      });
    }
  }

  if (intent === 'complaint') {
    if (!candidates.some((candidate) => candidate.field === 'issue_summary') && detectIntent(message) === 'complaint') {
      candidates.push({
        intent,
        field: 'issue_summary',
        value: message.trim(),
        source: 'user_direct',
      });
    }
  }

  return candidates;
}

function applyCandidates(
  intent: CanonicalIntentId,
  message: string,
  target: 'active' | 'suspended',
  collectedData: Record<string, string>,
  candidates: SlotCandidate[],
): {
  updatedData: Record<string, string>;
  acceptedSlots: AcceptedSlotDecision[];
  rejectedSlots: RejectedSlotDecision[];
} {
  const updatedData = { ...collectedData };
  const acceptedSlots: AcceptedSlotDecision[] = [];
  const rejectedSlots: RejectedSlotDecision[] = [];

  for (const candidate of candidates) {
    if (candidate.intent !== intent) continue;

    const validation = validateSlotCandidate(candidate.field, candidate.value, message);
    if (validation.accepted && validation.normalizedValue) {
      updatedData[candidate.field] = validation.normalizedValue;
      acceptedSlots.push({
        ...candidate,
        normalizedValue: validation.normalizedValue,
        target,
      });
      continue;
    }

    rejectedSlots.push({
      intent,
      field: candidate.field,
      value: candidate.value,
      source: candidate.source,
      reason: validation.reason || 'invalid_value',
      repairPrompt: validation.repairPrompt,
      target,
    });
  }

  return {
    updatedData,
    acceptedSlots,
    rejectedSlots,
  };
}

function maybeRejectExpectedField(
  intent: CanonicalIntentId,
  message: string,
  collectedData: Record<string, string>,
): RejectedSlotDecision[] {
  const nextField = nextMissingField(intent, collectedData);
  if (!nextField) return [];

  if ((nextField === 'phone' || nextField === 'contact') && detectExplicitInvalidPhone(message)) {
    const invalid = detectExplicitInvalidPhone(message) || '';
    const validation = validateSlotCandidate(nextField, invalid, message);
    return [{
      intent,
      field: nextField,
      value: invalid,
      source: 'user_direct',
      reason: validation.reason || 'invalid_phone',
      repairPrompt: validation.repairPrompt,
      target: 'active',
    }];
  }

  if (canSkipField(nextField) && /skip|not sure|don't know/i.test(message)) {
    const validation = validateSlotCandidate(nextField, 'skip', message);
    if (validation.accepted && validation.normalizedValue) {
      return [];
    }
  }

  return [];
}

function buildDisplayText(params: {
  handledIntent: CanonicalIntentId;
  currentState: string;
  updatedData: Record<string, string>;
  acceptedSlots: AcceptedSlotDecision[];
  rejectedSlots: RejectedSlotDecision[];
  nextField: AgenticFieldId | null;
  faqAnswer: string | null;
  completedIntent: CanonicalIntentId | null;
  resumedIntent: CanonicalIntentId | null;
  userName: string | null;
  plannerDisplayText?: string | null;
}): string {
  const {
    handledIntent,
    currentState,
    updatedData,
    acceptedSlots,
    rejectedSlots,
    nextField,
    faqAnswer,
    completedIntent,
    resumedIntent,
    userName,
    plannerDisplayText,
  } = params;

  if (rejectedSlots.length > 0) {
    return rejectedSlots[0].repairPrompt;
  }

  if (completedIntent) {
    if (completedIntent === 'complaint' && updatedData.contact) {
      const complaintCompletion = `Thank you. Our support team will call you on ${updatedData.contact} about this complaint.`;
      if (resumedIntent && nextField) {
        return `${complaintCompletion} Returning to your ${AGENTIC_PLAYBOOKS[resumedIntent].displayName.toLowerCase()} request. ${getFieldQuestion(nextField)}`;
      }
      return complaintCompletion;
    }
    const completionText = AGENTIC_PLAYBOOKS[completedIntent].completionConfirmation;
    if (resumedIntent && nextField) {
      return `${completionText} Returning to your ${AGENTIC_PLAYBOOKS[resumedIntent].displayName.toLowerCase()} request. ${getFieldQuestion(nextField)}`;
    }
    return completionText;
  }

  if (faqAnswer && nextField) {
    return `${faqAnswer} ${getFieldQuestion(nextField)}`;
  }

  // Prefer high-confidence planner text if available and not in a terminal/rejection state
  if (plannerDisplayText && !completedIntent && !faqAnswer) {
    return plannerDisplayText;
  }

  if (acceptedSlots.length > 0 && nextField) {
    if (
      handledIntent === 'maid_registration' &&
      currentState === 'START' &&
      nextField === 'contact'
    ) {
      return 'I can help register you for work opportunities. Please share your name and 10-digit mobile number.';
    }

    const acceptedPhone = acceptedSlots.find((slot) => slot.field === 'phone' || slot.field === 'contact');
    if (acceptedPhone) {
      if (handledIntent === 'complaint' && updatedData.issue_summary) {
        return `Thank you for sharing ${acceptedPhone.normalizedValue}. Our support team will call you about this complaint.`;
      }
      if (handledIntent === 'maid_registration' && userName) {
        const workType = updatedData.role_service_offered || 'domestic';
        return `Thank you ${userName}, you are registered for ${workType.toLowerCase()} work. ${getFieldQuestion(nextField)}`;
      }
      return `Thank you for sharing ${acceptedPhone.normalizedValue}! ${getFieldQuestion(nextField)}`;
    }

    return `Got it! ${getFieldQuestion(nextField)}`;
  }

  if (handledIntent === 'general') {
    return faqAnswer || 'I can help with domestic help services in Bengaluru. Please tell me what you need.';
  }

  if (nextField) {
    if (currentState === 'START') {
      return `${AGENTIC_PLAYBOOKS[handledIntent].entryConfirmation} ${getFieldQuestion(nextField)}`;
    }

    return getFieldQuestion(nextField);
  }

  return AGENTIC_PLAYBOOKS[handledIntent].completionConfirmation;
}

export async function runAgenticTurn(input: AgenticTurnInput): Promise<AgenticDecision> {
  const normalizedIntent = normalizeIntentId(input.activeIntent);
  const faqAnswer = buildFaqAnswer(normalizedIntent, input.userMessage);
  const detectedSideIntent = detectIntent(input.userMessage);


  let intentStack = input.intentStack.map(normalizeSnapshot);
  let handledIntent = normalizedIntent;
  let currentState = input.currentState || 'START';
  let collectedData = { ...input.collectedData };
  let slotAttempts = { ...input.slotAttempts };
  const intentHistory = input.intentHistory.map((intent) => normalizeIntentId(intent));

  if (detectedSideIntent !== 'general' && detectedSideIntent !== normalizedIntent && AGENTIC_PLAYBOOKS[normalizedIntent].allowSuspend) {
    intentStack = [
      ...intentStack,
      {
        intent: normalizedIntent,
        currentState,
        collectedData,
        slotAttempts,
        repairContext: null,
      },
    ];
    handledIntent = detectedSideIntent;
    currentState = 'START';
    collectedData = {};
    slotAttempts = {};
  }

  const activeCandidates = extractCandidatesForIntent(handledIntent, input.userMessage);
  const activeResult = applyCandidates(handledIntent, input.userMessage, 'active', collectedData, activeCandidates);
  const explicitRejections = maybeRejectExpectedField(handledIntent, input.userMessage, activeResult.updatedData);

  let updatedStack = [...intentStack];
  let suspendedAccepted: AcceptedSlotDecision[] = [];
  let suspendedRejected: RejectedSlotDecision[] = [];

  const topSnapshot = updatedStack.at(-1);
  if (topSnapshot) {
    const suspendedIntent = topSnapshot.intent;
    const suspendedCandidates = extractCandidatesForIntent(suspendedIntent, input.userMessage);
    const suspendedResult = applyCandidates(
      suspendedIntent,
      input.userMessage,
      'suspended',
      topSnapshot.collectedData,
      suspendedCandidates,
    );


    if (suspendedResult.acceptedSlots.length > 0 || suspendedResult.rejectedSlots.length > 0) {
      updatedStack[updatedStack.length - 1] = {
        ...topSnapshot,
        collectedData: suspendedResult.updatedData,
      };
      suspendedAccepted = suspendedResult.acceptedSlots;
      suspendedRejected = suspendedResult.rejectedSlots;
    }
  }

  const acceptedSlots = [...activeResult.acceptedSlots, ...suspendedAccepted];
  const rejectedSlots = [...explicitRejections, ...activeResult.rejectedSlots, ...suspendedRejected];

  let updatedData = activeResult.updatedData;
  let completedIntent: CanonicalIntentId | null = null;
  let resumedIntent: CanonicalIntentId | null = null;

  // ─── Level 3 Planning Step (3-Strike Policy) ──────────────────────────────
  const planner = new AgentPlanner();
  let plan: any = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    plan = await planner.createPlan({
      activeIntent: handledIntent,
      currentState,
      collectedData: updatedData,
      history: input.history || [{ role: 'user', content: input.userMessage }],
    }, plan || undefined);

    if (plan.confidence >= 70) break;
    attempts++;
  }

  const usePlanner = plan && plan.confidence >= 70;
  let nextField: AgenticFieldId | null = null;
  let nextState: string = 'START';

  if (usePlanner) {
    // 1. Resolve State/Field from Planner
    if (plan.nextAction === 'COMPLETE') {
      nextField = null;
      nextState = AGENTIC_PLAYBOOKS[handledIntent].completionState;
    } else if (plan.nextAction.startsWith('ASK_')) {
      const fieldFromAction = plan.nextAction.replace('ASK_', '').toLowerCase() as AgenticFieldId;
      const playbook = getPlaybook(handledIntent);
      if (playbook.supportedFields.includes(fieldFromAction)) {
        nextField = fieldFromAction;
        nextState = mapStateForField(handledIntent, nextField);
      } else {
        // AI Hallucination fallback
        nextField = nextMissingField(handledIntent, updatedData);
        nextState = handledIntent === 'general' ? 'START' : mapStateForField(handledIntent, nextField);
      }
    } else {
      nextState = plan.nextAction;
      const playbook = getPlaybook(handledIntent);
      nextField = (Object.entries(playbook.fieldStateMap).find(([_, s]) => s === nextState)?.[0] as AgenticFieldId) || null;
    }
  } else {
    // 2. Safety Fallback: Deterministic Logic
    nextField = nextMissingField(handledIntent, updatedData);
    nextState = handledIntent === 'general' ? 'START' : mapStateForField(handledIntent, nextField);
  }

  const completed = handledIntent !== 'general' && nextField === null;

  if (completed) {
    completedIntent = handledIntent;
    if (updatedStack.length > 0) {
      const resumed = updatedStack.pop()!;
      resumedIntent = resumed.intent;
      handledIntent = completedIntent;
      updatedData = resumed.collectedData;
      currentState = resumed.currentState;
      slotAttempts = resumed.slotAttempts;
      nextField = nextMissingField(resumed.intent, resumed.collectedData);
      nextState = mapStateForField(resumed.intent, nextField);
    } else {
      nextState = AGENTIC_PLAYBOOKS[handledIntent].completionState;
      currentState = nextState;
    }
  }

  const sessionSnapshot: AgenticSessionSnapshot = completedIntent && resumedIntent
    ? {
      activeIntent: resumedIntent,
      currentState: nextState,
      collectedData: updatedData,
      slotAttempts,
      intentStack: updatedStack,
      intentHistory: [...intentHistory, completedIntent],
    }
    : {
      activeIntent: handledIntent,
      currentState: handledIntent === 'general'
        ? 'START'
        : completed
          ? AGENTIC_PLAYBOOKS[handledIntent].completionState
          : nextState,
      collectedData: completed ? updatedData : activeResult.updatedData,
      slotAttempts,
      intentStack: updatedStack,
      intentHistory: [...intentHistory, handledIntent],
    };

  const displayText = buildDisplayText({
    handledIntent: completedIntent || handledIntent,
    currentState: input.currentState || 'START',
    updatedData: activeResult.updatedData,
    acceptedSlots,
    rejectedSlots,
    nextField: completedIntent && resumedIntent ? nextField : (usePlanner ? nextField : nextMissingField(sessionSnapshot.activeIntent, sessionSnapshot.collectedData)),
    faqAnswer,
    completedIntent,
    resumedIntent,
    userName: extractName(input.userMessage),
    plannerDisplayText: usePlanner ? plan.displayText : null,
  });

  const shouldEscalate = completedIntent !== null || Boolean(extractFieldValue('contact', input.userMessage));

  return {
    runtimeMode: input.runtimeMode,
    handledIntent: completedIntent || handledIntent,
    completedIntent,
    resumedIntent,
    extractedCandidates: [...activeCandidates, ...suspendedAccepted.map((slot) => ({
      intent: slot.intent,
      field: slot.field,
      value: slot.value,
      source: slot.source,
    }))],
    acceptedSlots,
    rejectedSlots,
    displayText,
    shouldEscalate,
    completed,
    sessionSnapshot,
    thoughtReflection: plan.reflection,
    confidenceScore: plan.confidence,
  };
}
