import type { CanonicalIntentId, ResponseFieldId } from '../responsePlaybooks.ts';

export type RuntimeMode = 'live_commit' | 'shadow_simulate';

export type CandidateSource = 'regex' | 'user_direct' | 'derived' | 'intent_switch';

export type AgenticFieldId = ResponseFieldId;

export interface IntentPlaybook {
  intent: CanonicalIntentId;
  displayName: string;
  supportedFields: AgenticFieldId[];
  requiredFields: AgenticFieldId[];
  optionalFields: AgenticFieldId[];
  fieldOrder: AgenticFieldId[];
  fieldStateMap: Partial<Record<AgenticFieldId, string>>;
  completionState: string;
  allowSuspend: boolean;
  answerFirst: boolean;
  entryConfirmation: string;
  completionConfirmation: string;
}

export interface SlotCandidate {
  intent: CanonicalIntentId;
  field: AgenticFieldId;
  value: string;
  source: CandidateSource;
}

export interface AcceptedSlotDecision extends SlotCandidate {
  normalizedValue: string;
  target: 'active' | 'suspended';
}

export interface RejectedSlotDecision {
  intent: CanonicalIntentId;
  field: AgenticFieldId;
  value: string;
  source: CandidateSource;
  reason: string;
  repairPrompt: string;
  target: 'active' | 'suspended';
}

export interface AgenticIntentSnapshot {
  intent: CanonicalIntentId;
  currentState: string;
  collectedData: Record<string, string>;
  slotAttempts: Record<string, number>;
  repairContext: string | null;
}

export interface AgenticSessionSnapshot {
  activeIntent: CanonicalIntentId;
  currentState: string;
  collectedData: Record<string, string>;
  slotAttempts: Record<string, number>;
  intentStack: AgenticIntentSnapshot[];
  intentHistory: CanonicalIntentId[];
}

export interface AgenticTurnInput {
  activeIntent: string;
  currentState: string;
  collectedData: Record<string, string>;
  slotAttempts: Record<string, number>;
  intentStack: AgenticIntentSnapshot[];
  intentHistory: string[];
  runtimeMode: RuntimeMode;
  userMessage: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AgenticDecision {
  runtimeMode: RuntimeMode;
  handledIntent: CanonicalIntentId;
  completedIntent: CanonicalIntentId | null;
  resumedIntent: CanonicalIntentId | null;
  extractedCandidates: SlotCandidate[];
  acceptedSlots: AcceptedSlotDecision[];
  rejectedSlots: RejectedSlotDecision[];
  displayText: string;
  shouldEscalate: boolean;
  completed: boolean;
  sessionSnapshot: AgenticSessionSnapshot;
  thoughtReflection?: string;
  confidenceScore?: number;
}

export interface AgentPlan {
  reflection: string;
  nextAction: string;
  confidence: number;
  displayText: string;
}

export interface PlannerContext {
  activeIntent: CanonicalIntentId;
  currentState: string;
  collectedData: Record<string, string>;
  history: { role: 'user' | 'assistant'; content: string }[];
}
