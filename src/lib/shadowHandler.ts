// Shared-runtime shadow mode: runs AFTER production response is sent.
// Simulates the same constrained runtime used by the live adapter.
// NEVER throws — all errors are swallowed to protect production path.

import { createClient } from '@supabase/supabase-js';
import { runAgenticTurn } from './agentic/runtime';
import type { AgenticIntentSnapshot } from './agentic/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ShadowProposal = {
  next_state: string;
  slots: Record<string, string>;
  accepted_slots: unknown[];
  rejected_slots: unknown[];
  tool_calls: string[];
};

function mapIntentStack(intentStack: any[] | undefined): AgenticIntentSnapshot[] {
  return (intentStack || []).map((snapshot) => ({
    intent: snapshot.intent,
    currentState: snapshot.state || snapshot.currentState || 'START',
    collectedData: snapshot.slots || snapshot.collectedData || {},
    slotAttempts: snapshot.slot_attempts || snapshot.slotAttempts || {},
    repairContext: snapshot.repair_context || snapshot.repairContext || null,
  }));
}

export async function runShadowHandler(
  conversationId: string,
  turnNumber: number,
  currentIntent: string,
  userMessage: string,
  currentState: string,
  currentSlots: Record<string, any>,
  prodNextState: string,
  prodSlots: Record<string, any>,
  intentStack: any[] = [],
  intentHistory: string[] = [],
): Promise<void> {
  if (process.env.USE_AGENTIC === 'true') return;

  const shadowStart = Date.now();
  try {
    const decision = await runAgenticTurn({
      activeIntent: currentIntent,
      currentState,
      collectedData: { ...(currentSlots || {}) },
      slotAttempts: {},
      intentStack: mapIntentStack(intentStack),
      intentHistory,
      runtimeMode: 'shadow_simulate',
      userMessage,
    });

    const proposal: ShadowProposal = {
      next_state: decision.sessionSnapshot.currentState,
      slots: decision.sessionSnapshot.collectedData,
      accepted_slots: decision.acceptedSlots,
      rejected_slots: decision.rejectedSlots,
      tool_calls: decision.acceptedSlots.map((slot) => `save_${slot.field}`),
    };

    const stateAgreed = proposal.next_state === prodNextState;
    const slotKeys = Array.from(new Set([...Object.keys(prodSlots || {}), ...Object.keys(proposal.slots || {})]));
    const slotsAgreed = slotKeys.every((key) => {
      const prodValue = prodSlots?.[key] ?? null;
      const shadowValue = proposal.slots?.[key] ?? null;
      return prodValue === shadowValue;
    });

    await supabase.from('shadow_logs').insert({
      conversation_id: conversationId,
      turn_number: turnNumber,
      current_state: currentState,
      user_message: userMessage,
      prod_next_state: prodNextState,
      prod_slots: prodSlots,
      shadow_proposal: proposal,
      agreed: stateAgreed && slotsAgreed,
      shadow_latency_ms: Date.now() - shadowStart,
    });
  } catch (err) {
    console.error('[Shadow] Error (non-fatal):', (err as Error).message);
  }
}
