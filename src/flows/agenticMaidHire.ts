// @ts-nocheck
// src/flows/agenticMaidHire.ts
// Phase 14: Shared Agentic Runtime Adapter for maid_hire
//
// Refactored to use the shared runAgenticTurn() runtime for consistency,
// multi-intent support, and faithful shadow parity.

import { createClient } from '@supabase/supabase-js';
import { applyStrictGuardrails } from '../lib/guardrails';
import { extractName } from '../extractors/dataExtractor';
import type { CollectedData } from './BaseFlow';
import type { ExtractionMeta } from '../extractors/llmExtractor';
import { runAgenticTurn } from '../lib/agentic/runtime';
import type { AgenticIntentSnapshot } from '../lib/agentic/types';

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Private: saveAgenticSession ─────────────────────────────────────────────
async function saveAgenticSession(
  conversationId: string,
  newState: string,
  collectedData: CollectedData,
  attempts: number,
  extras?: {
    detectedIntent?: string;
    slotAttempts?: Record<string, number>;
    intentStack?: AgenticIntentSnapshot[];
    intentHistory?: string[];
  },
): Promise<void> {
  try {
    const updatePayload: Record<string, unknown> = {
      current_state: newState,
      collected_data: collectedData,
      attempts,
      last_activity: new Date().toISOString(),
      agentic_mode: true,
    };

    if (extras?.detectedIntent) {
      updatePayload.detected_intent = extras.detectedIntent;
    }

    if (extras?.slotAttempts) {
      updatePayload.slot_attempts = extras.slotAttempts;
    }

    if (extras?.intentStack) {
      updatePayload.intent_stack = extras.intentStack.map((snapshot) => ({
        intent: snapshot.intent,
        state: snapshot.currentState,
        slots: snapshot.collectedData,
        slot_attempts: snapshot.slotAttempts,
        repair_context: snapshot.repairContext,
      }));
    }

    if (extras?.intentHistory) {
      updatePayload.intent_history = extras.intentHistory;
    }

    await supabase
      .from('conversation_sessions')
      .update(updatePayload)
      .eq('conversation_id', conversationId);
  } catch (err) {
    console.error('[Agentic] Session save error:', (err as Error).message);
  }
}

// ─── handleMaidHireAgentic ────────────────────────────────────────────────────
// Main agentic handler for maid_hire sessions.
// Return type MUST match handleMaidHireStateMachine exactly for drop-in use in route.ts.
export async function handleMaidHireAgentic(
  conversationId: string,
  latestMessage: string,
  coreMessages: any[],
  dbSession: any,
): Promise<{
  displayText: string;
  shouldEscalate: boolean;
  collectedData: Record<string, any>;
  tookMs: number;
  systemPrompt: string;
  rawResponse: string;
  extractionMeta: ExtractionMeta;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  newState: string;
}> {
  const extractionMeta: ExtractionMeta = {
    sources: {},
    latency_ms: 0,
    llm_raw: null,
    fallback_triggered: false,
  };

  const runtimeStart = Date.now();
  const runtimeDecision = await runAgenticTurn({
    activeIntent: 'maid_hire',
    currentState: dbSession?.current_state || 'START',
    collectedData: { ...(dbSession?.collected_data || {}) },
    slotAttempts: { ...(dbSession?.slot_attempts || {}) },
    intentStack: ((dbSession?.intent_stack || []) as any[]).map((snapshot) => ({
      intent: snapshot.intent,
      currentState: snapshot.state || snapshot.currentState || 'START',
      collectedData: snapshot.slots || snapshot.collectedData || {},
      slotAttempts: snapshot.slot_attempts || snapshot.slotAttempts || {},
      repairContext: snapshot.repair_context || snapshot.repairContext || null,
    })),
    intentHistory: dbSession?.intent_history || ['maid_hire'],
    runtimeMode: 'live_commit',
    userMessage: latestMessage,
  });

  const runtimeCollectedData = runtimeDecision.sessionSnapshot.collectedData as CollectedData;
  const runtimeTelemetry = {
    runtime: 'shared_agentic',
    handledIntent: runtimeDecision.handledIntent,
    completedIntent: runtimeDecision.completedIntent,
    resumedIntent: runtimeDecision.resumedIntent,
    acceptedSlots: runtimeDecision.acceptedSlots,
    rejectedSlots: runtimeDecision.rejectedSlots,
    sessionSnapshot: runtimeDecision.sessionSnapshot,
  };

  await saveAgenticSession(
    conversationId,
    runtimeDecision.sessionSnapshot.currentState,
    runtimeCollectedData,
    runtimeDecision.rejectedSlots.length > 0 ? (dbSession?.attempts ?? 0) + 1 : 0,
    {
      detectedIntent: runtimeDecision.sessionSnapshot.activeIntent,
      slotAttempts: runtimeDecision.sessionSnapshot.slotAttempts,
      intentStack: runtimeDecision.sessionSnapshot.intentStack,
      intentHistory: runtimeDecision.sessionSnapshot.intentHistory,
    },
  );

  return {
    displayText: applyStrictGuardrails(runtimeDecision.displayText),
    shouldEscalate: runtimeDecision.shouldEscalate,
    collectedData: runtimeCollectedData,
    tookMs: Date.now() - runtimeStart,
    systemPrompt: 'SHARED_AGENTIC_RUNTIME',
    rawResponse: JSON.stringify(runtimeTelemetry),
    extractionMeta: {
      ...extractionMeta,
      latency_ms: Date.now() - runtimeStart,
      llm_raw: runtimeTelemetry as any,
    } as ExtractionMeta,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    newState: runtimeDecision.sessionSnapshot.currentState,
  };
}
