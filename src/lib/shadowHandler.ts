// src/lib/shadowHandler.ts
// Async shadow mode: runs AFTER production response is sent.
// Compares agentic proposal vs production state machine decision.
// Writes alignment data to shadow_logs table.
// NEVER throws — all errors swallowed to protect production path.

import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ShadowProposal {
  next_state: string;
  slots: Record<string, string | null>;
  tool_calls: string[];
}

const SHADOW_SYSTEM_PROMPT = `You are an agentic AI simulating a maid hiring flow.
Given the user message, current state, and currently collected slots, decide what to do next.
Respond with ONLY valid JSON (no markdown fences):
{
  "next_state": "ASK_PHONE | ASK_LOCATION | ASK_SERVICE | ASK_SCHEDULE | ASK_SALARY | ASK_FAMILY | ASK_EXPERIENCE | COMPLETE",
  "slots": { "phone": null, "location": null, "service_type": null, "schedule": null, "salary_range": null, "family_size": null, "has_experience": null },
  "tool_calls": ["collect_phone", "collect_location", etc]
}
Fill extracted slot values. Set next_state to what you would ask next.`;

export async function runShadowHandler(
  conversationId: string,
  turnNumber: number,
  userMessage: string,
  currentState: string,
  currentSlots: Record<string, any>,
  prodNextState: string,
  prodSlots: Record<string, any>,
): Promise<void> {
  // Only run when USE_AGENTIC is not live (shadow mode monitors readiness)
  if (process.env.USE_AGENTIC === 'true') return;

  const shadowStart = Date.now();
  try {
    const { text } = await generateText({
      model: google('gemma-3-27b-it'),
      system: SHADOW_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify({ userMessage, currentState, currentSlots }),
      }],
    });

    // Strip markdown fences if present before parsing
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let proposal: ShadowProposal;
    try {
      proposal = JSON.parse(cleaned);
    } catch {
      // LLM returned non-JSON — log as disagreed with null proposal
      await supabase.from('shadow_logs').insert({
        conversation_id: conversationId,
        turn_number: turnNumber,
        current_state: currentState,
        user_message: userMessage,
        prod_next_state: prodNextState,
        prod_slots: prodSlots,
        shadow_proposal: null,
        agreed: null,   // null = parse failure, not a real comparison
        shadow_latency_ms: Date.now() - shadowStart,
      });
      return;
    }

    // Compare: agreed if next_state matches AND key slots match
    const stateAgreed = proposal.next_state === prodNextState;
    const slotKeys = ['phone', 'location', 'service_type', 'schedule', 'salary_range', 'family_size', 'has_experience'];
    const slotsAgreed = slotKeys.every(k => {
      const prodVal = prodSlots[k] ?? null;
      const shadowVal = proposal.slots?.[k] ?? null;
      // Both null = agreed; both same value = agreed
      return prodVal === shadowVal || (prodVal && shadowVal && prodVal === shadowVal);
    });
    const agreed = stateAgreed && slotsAgreed;

    await supabase.from('shadow_logs').insert({
      conversation_id: conversationId,
      turn_number: turnNumber,
      current_state: currentState,
      user_message: userMessage,
      prod_next_state: prodNextState,
      prod_slots: prodSlots,
      shadow_proposal: proposal,
      agreed,
      shadow_latency_ms: Date.now() - shadowStart,
    });
  } catch (err) {
    // Swallow all errors — shadow must never affect production path
    console.error('[Shadow] Error (non-fatal):', (err as Error).message);
  }
}
