// src/flows/agenticMaidHire.ts
// Phase 2: Agentic maid_hire handler using LLM tool-calling (Vercel AI SDK)
//
// Replaces the deterministic state machine with an LLM-driven flow.
// The LLM decides field collection order and phrasing; tools enforce validation.
// Gated behind USE_AGENTIC=true env var in route.ts.

import { tool, generateText } from 'ai';
import { z } from 'zod';
import { google } from '@ai-sdk/google';
import { createClient } from '@supabase/supabase-js';
import { applyStrictGuardrails } from '../lib/guardrails';
import { isValidPhone } from '../extractors/dataExtractor';
import type { CollectedData } from './BaseFlow';
import type { ExtractionMeta } from '../extractors/llmExtractor';

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Inline validators (re-declared; NOT imported from MaidHiringFlow.ts) ────
// These are module-private in MaidHiringFlow.ts, so we copy them here to avoid coupling.

const BENGALURU_AREAS = [
  'koramangala', 'indiranagar', 'whitefield', 'marathahalli', 'btm',
  'hsr', 'hsr layout', 'electronic city', 'jp nagar', 'jayanagar', 'malleshwaram',
  'rajajinagar', 'yeshwanthpur', 'hebbal', 'bannerghatta', 'sarjapur', 'bellandur',
  'kormangala', 'mg road', 'mgroad', 'brigade road', 'yelahanka', 'rt nagar',
  'basavanagudi', 'vijayanagar', 'banashankari', 'sadashivanagar', 'frazer town',
  'cox town', 'ulsoor', 'richmond town', 'wilson garden', 'bommanahalli', 'begur',
  'arekere', 'kudlu gate', 'kengeri', 'nagarbhavi', 'peenya', 'dasarahalli', 'rr nagar',
  'domlur', 'hal', 'old airport road', 'cunningham road', 'residency road', 'lavelle road',
  'church street', 'majestic', 'shivajinagar', 'gandhi nagar', 'chamrajpet', 'chickpet',
  'kalasipalya', 'kr market', 'city market', 'bangalore', 'bengaluru', 'blr',
];

const SERVICE_TYPES = [
  'cooking', 'cleaning', 'baby care', 'babysitting', 'elderly care',
  'baby', 'elderly', 'cook', 'clean', 'both',
];

const SCHEDULE_TYPES = [
  '24-hour live-in', '12-hour day', 'live-in', 'live in', 'full-time',
  'fulltime', 'full time', 'part-time', 'parttime', 'part time', '24 hour', '12 hour',
  'day maid', 'morning', 'evening',
];

function validateLocation(v: string | null | undefined): boolean {
  if (!v) return false;
  const lower = v.toLowerCase();
  return BENGALURU_AREAS.some(area => lower.includes(area)) || lower.length >= 2;
}

function validateServiceType(v: string | null | undefined): boolean {
  if (!v) return false;
  const lower = v.toLowerCase();
  return SERVICE_TYPES.some(t => lower.includes(t));
}

function validateSchedule(v: string | null | undefined): boolean {
  if (!v) return false;
  const lower = v.toLowerCase();
  return SCHEDULE_TYPES.some(t => lower.includes(t));
}

// ─── Constants ────────────────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['phone', 'location', 'service_type', 'schedule'] as const;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const TOOL_LOOP_THRESHOLD = 3;
const PER_1K_TOKENS = 0; // Gemma 3 27B is free

// ─── Agentic tool definitions ─────────────────────────────────────────────────
// All 8 tools: 7 save_* tools + 1 escalate tool.
// Each execute() validates the value and returns {success, field?, value?, error?}.

export const agenticTools = {
  save_phone: tool({
    description: 'Save the customer phone number when they provide it. Call ONLY when the user has provided a 10-digit Indian mobile number.',
    inputSchema: z.object({
      phone: z.string().describe('Indian mobile number, 10 digits, starts with 6-9. Strip country code (+91/91) if present.'),
    }),
    execute: async ({ phone }) => {
      const normalized = phone.replace(/\D/g, '').slice(-10);
      if (!isValidPhone(normalized)) {
        return { success: false, error: 'Please share a valid 10-digit mobile number (e.g., 9876543210).' };
      }
      return { success: true, field: 'phone', value: normalized };
    },
  }),

  save_location: tool({
    description: 'Save the Bengaluru area or locality when the customer provides it.',
    inputSchema: z.object({
      location: z.string().describe('Bengaluru area or locality name (e.g., Koramangala, Indiranagar, Whitefield)'),
    }),
    execute: async ({ location }) => {
      if (!validateLocation(location)) {
        return { success: false, error: 'Please share your area in Bengaluru (e.g., Koramangala, Indiranagar, Whitefield).' };
      }
      return { success: true, field: 'location', value: location };
    },
  }),

  save_service_type: tool({
    description: 'Save the type of domestic help needed when the customer specifies it.',
    inputSchema: z.object({
      service_type: z.string().describe('Type of domestic help: Cooking, Cleaning, Baby Care, Elderly Care, or similar'),
    }),
    execute: async ({ service_type }) => {
      if (!validateServiceType(service_type)) {
        return { success: false, error: 'Please choose from: Cooking, Cleaning, Baby Care, or Elderly Care.' };
      }
      return { success: true, field: 'service_type', value: service_type };
    },
  }),

  save_schedule: tool({
    description: 'Save the maid schedule preference when the customer specifies it.',
    inputSchema: z.object({
      schedule: z.string().describe('Schedule preference: 24-hour Live-in (stays at home) or 12-hour Day (morning to evening)'),
    }),
    execute: async ({ schedule }) => {
      if (!validateSchedule(schedule)) {
        return { success: false, error: 'Please let us know — 24-hour Live-in maid or 12-hour Day maid?' };
      }
      return { success: true, field: 'schedule', value: schedule };
    },
  }),

  save_salary_range: tool({
    description: 'Save the expected salary range when the customer mentions it. This field is optional.',
    inputSchema: z.object({
      salary_range: z.string().describe('Expected salary or budget (e.g., 15k, Rs 12000, 15-20k, or "flexible")'),
    }),
    execute: async ({ salary_range }) => {
      if (!salary_range || salary_range.trim().length === 0) {
        return { success: false, error: 'Please share a salary range or say "skip" to continue.' };
      }
      return { success: true, field: 'salary_range', value: salary_range.trim() };
    },
  }),

  save_family_size: tool({
    description: 'Save the number of family members when the customer mentions it. This field is optional.',
    inputSchema: z.object({
      family_size: z.string().describe('Number of people in household (e.g., "4", "family of 3", "couple")'),
    }),
    execute: async ({ family_size }) => {
      if (!family_size || family_size.trim().length === 0) {
        return { success: false, error: 'How many people are in your family? You can also say "skip".' };
      }
      return { success: true, field: 'family_size', value: family_size.trim() };
    },
  }),

  save_has_experience: tool({
    description: 'Save whether the customer has hired a maid before. This field is optional.',
    inputSchema: z.object({
      has_experience: z.string().describe('Whether they hired domestic help before (Yes/No/details)'),
    }),
    execute: async ({ has_experience }) => {
      if (!has_experience || has_experience.trim().length === 0) {
        return { success: false, error: 'Have you hired a maid before? Yes, No, or any details are fine.' };
      }
      return { success: true, field: 'has_experience', value: has_experience.trim() };
    },
  }),

  escalate: tool({
    description: 'Escalate to human support when the customer is angry, frustrated, has an urgent complaint mid-flow, or explicitly asks to speak to a human.',
    inputSchema: z.object({
      reason: z.string().describe('Brief reason for escalation (e.g., "Customer is angry about service quality")'),
    }),
    execute: async ({ reason }) => {
      return { success: true, field: '__escalate', value: reason };
    },
  }),
} as const;

// ─── Helper: isComplete ───────────────────────────────────────────────────────
// Returns true only when all 4 required fields are truthy non-empty strings.
function isComplete(collectedData: CollectedData): boolean {
  return REQUIRED_FIELDS.every(f => {
    const val = collectedData[f];
    return typeof val === 'string' && val.trim().length > 0;
  });
}

// ─── Helper: detectToolLoop ───────────────────────────────────────────────────
// Returns true when any tool has been called TOOL_LOOP_THRESHOLD or more times.
function detectToolLoop(collectedData: CollectedData): boolean {
  const raw = (collectedData as any).__tool_calls || '{}';
  try {
    const toolCalls: Record<string, number> = JSON.parse(raw);
    return Object.values(toolCalls).some(count => count >= TOOL_LOOP_THRESHOLD);
  } catch {
    return false;
  }
}

// ─── Helper: updateToolCallCount ─────────────────────────────────────────────
// Increments the call count for toolName in __tool_calls JSON string.
function updateToolCallCount(collectedData: CollectedData, toolName: string): CollectedData {
  const raw = (collectedData as any).__tool_calls || '{}';
  let toolCalls: Record<string, number> = {};
  try {
    toolCalls = JSON.parse(raw);
  } catch {
    toolCalls = {};
  }
  toolCalls[toolName] = (toolCalls[toolName] || 0) + 1;
  return { ...collectedData, __tool_calls: JSON.stringify(toolCalls) } as CollectedData;
}

// ─── Helper: shouldForceEscalateAgentic ──────────────────────────────────────
function shouldForceEscalateAgentic(consecutiveFailures: number): boolean {
  return consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;
}

// ─── Helper: buildAgenticSystemPrompt ────────────────────────────────────────
// Builds the system prompt showing collected data and still-needed fields.
function buildAgenticSystemPrompt(collectedData: CollectedData): string {
  // Summarise collected data (excluding internal __ keys)
  const collectedEntries = Object.entries(collectedData)
    .filter(([k, v]) => !k.startsWith('__') && typeof v === 'string' && v.trim().length > 0)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n');

  const collectedSection = collectedEntries
    ? `COLLECTED DATA:\n${collectedEntries}`
    : 'COLLECTED DATA:\n  (none yet)';

  // Determine still-needed fields
  const requiredRemaining = REQUIRED_FIELDS.filter(f => {
    const val = collectedData[f];
    return !val || val.trim().length === 0;
  });

  const optionalFields = ['salary_range', 'family_size', 'has_experience'] as const;
  const optionalRemaining = optionalFields.filter(f => {
    const val = collectedData[f];
    return !val || val.trim().length === 0;
  });

  const stillNeededRequired = requiredRemaining.length > 0
    ? `STILL NEEDED (required): ${requiredRemaining.join(', ')}`
    : 'STILL NEEDED (required): (all collected)';

  const stillNeededOptional = optionalRemaining.length > 0
    ? `STILL NEEDED (optional): ${optionalRemaining.join(', ')}`
    : 'STILL NEEDED (optional): (all collected)';

  return `ROLE: EzyBot — domestic help intake assistant for EzyHelpers.com, Bengaluru.

${collectedSection}

${stillNeededRequired}
${stillNeededOptional}

INSTRUCTIONS:
1. Greet the customer warmly on the first turn, then ask for the FIRST missing required field.
2. When the customer provides information for any field, call the appropriate save_* tool immediately.
3. Call EXACTLY ONE tool per message. NEVER call multiple tools at once.
4. If the customer provides information you haven't asked for yet (e.g., they volunteer their location before you ask), call the appropriate save_* tool immediately to save it.
5. If a customer asks a FAQ (pricing, process, background verification etc.), answer briefly, then re-ask the current missing required field.
6. If the customer seems angry, frustrated, or explicitly asks for a human, call escalate().
7. After ALL required fields are collected, thank the customer and say our team will call them within 2 hours. Do NOT ask more questions.
8. For optional fields (salary_range, family_size, has_experience), only ask once all required fields are collected.

RULES:
- Ask EXACTLY ONE question per message.
- NEVER mention specific prices or salary amounts you quote yourself.
- NEVER offer to call the customer yourself.
- NEVER ask for information already collected (see COLLECTED DATA above).
- Keep responses concise — 1-3 sentences maximum.
- Schedule options are: "24-hour Live-in maid" (stays at home overnight) or "12-hour Day maid" (morning to evening, goes home at night).`;
}

// ─── Private: saveAgenticSession ─────────────────────────────────────────────
// Persists agentic session state to Supabase. Always writes agentic_mode=true.
async function saveAgenticSession(
  conversationId: string,
  newState: string,
  collectedData: CollectedData,
  attempts: number,
): Promise<void> {
  try {
    await supabase
      .from('conversation_sessions')
      .update({
        current_state: newState,
        collected_data: collectedData,
        attempts,
        last_activity: new Date().toISOString(),
        agentic_mode: true,
      })
      .eq('conversation_id', conversationId);
  } catch (err) {
    console.error('[Agentic] Session save error:', (err as Error).message);
  }
}

// ─── handleMaidHireAgentic ────────────────────────────────────────────────────
// Main agentic handler for maid_hire sessions.
// Return type MUST match handleMaidHireStateMachine exactly for drop-in use in route.ts.
//
// CRITICAL: Do NOT wrap generateText() in try/catch.
// Gemini API errors must propagate to route.ts for single-turn deterministic fallback.
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
  const startTime = Date.now();

  // Default extractionMeta for agentic path (no regex extraction runs here — tools handle validation)
  const extractionMeta: ExtractionMeta = {
    sources: {},
    latency_ms: 0,
    llm_raw: null,
    fallback_triggered: false,
  };

  // 1. Load collectedData from DB session
  let collectedData: CollectedData = (dbSession?.collected_data || {}) as CollectedData;

  // 2. Parse consecutive failures from collectedData
  let consecutiveFailures = parseInt((collectedData as any).__consecutive_failures || '0', 10);
  if (isNaN(consecutiveFailures)) consecutiveFailures = 0;

  // 3. Early return: loop already detected in a previous turn → route.ts will fall back to deterministic
  if ((collectedData as any).__loop_detected === 'true') {
    return {
      displayText: "Let me find the right way to help you. One moment...",
      shouldEscalate: false,
      collectedData,
      tookMs: Date.now() - startTime,
      systemPrompt: 'LOOP_DETECTED_EARLY',
      rawResponse: '',
      extractionMeta,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      newState: 'LOOP_DETECTED',
    };
  }

  // 4. Build system prompt
  const systemPrompt = buildAgenticSystemPrompt(collectedData);

  // 5. Call generateText() with tools.
  //    NOTE: No try/catch here — Gemini API errors propagate to route.ts
  //    so it can fall back to handleMaidHireStateMachine for this single turn.
  const result = await generateText({
    model: google('gemma-3-27b-it'),
    tools: agenticTools,
    toolChoice: 'auto',
    system: systemPrompt,
    messages: [{ role: 'user', content: latestMessage }],
    // No stopWhen — default single-step execution (one LLM call per turn)
  });

  // 6. Capture token usage
  const promptTokens = result.usage?.inputTokens ?? 0;
  const completionTokens = result.usage?.outputTokens ?? 0;
  const totalTokens = result.usage?.totalTokens ?? (promptTokens + completionTokens);
  const estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS;

  // 7. Process tool calls
  let escalateCalled = false;
  let toolError: string | undefined;
  let toolSucceeded = false;

  if (result.toolCalls && result.toolCalls.length > 0) {
    // If LLM called multiple tools (should not happen per prompt), log warning and process only first
    if (result.toolCalls.length > 1) {
      console.warn(`[Agentic] LLM called ${result.toolCalls.length} tools — processing only first`);
    }

    const toolCall = result.toolCalls[0];
    const toolName = toolCall.toolName as string;

    // Update tool call count in collectedData for loop detection
    collectedData = updateToolCallCount(collectedData, toolName);

    // Read the tool result (execute() already ran via the AI SDK)
    if (result.toolResults && result.toolResults.length > 0) {
      const output = result.toolResults[0].output as {
        success: boolean;
        field?: string;
        value?: string;
        error?: string;
      };

      if (output.success && output.field && output.value !== undefined) {
        // Valid slot saved
        if (output.field === '__escalate') {
          // escalate() tool was called
          escalateCalled = true;
        } else {
          // Save the field value to collectedData
          (collectedData as any)[output.field] = output.value;
        }
        // Reset consecutive failures on any successful save
        consecutiveFailures = 0;
        toolSucceeded = true;
      } else if (!output.success) {
        // Validator rejected — increment failure counter
        consecutiveFailures += 1;
        toolError = output.error;
      }
    }
  }

  // 8. Update consecutive failures in collectedData
  (collectedData as any).__consecutive_failures = String(consecutiveFailures);

  // 9. Check loop detection AFTER updating tool call counts
  if (detectToolLoop(collectedData)) {
    (collectedData as any).__loop_detected = 'true';
    await saveAgenticSession(conversationId, 'LOOP_DETECTED', collectedData, (dbSession?.attempts ?? 0) + 1);
    return {
      displayText: "Let me find the right way to help you. One moment...",
      shouldEscalate: false,
      collectedData,
      tookMs: Date.now() - startTime,
      systemPrompt,
      rawResponse: result.text || '',
      extractionMeta,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      newState: 'LOOP_DETECTED',
    };
  }

  // 10. Check force escalate (3 consecutive validation failures)
  if (shouldForceEscalateAgentic(consecutiveFailures)) {
    const hasPhone = !!(collectedData.phone && collectedData.phone.trim().length > 0);
    const forceText = hasPhone
      ? `Our team will call you at ${collectedData.phone} within 2 hours.`
      : "Our team is standing by. Call us directly or try again shortly.";

    await saveAgenticSession(conversationId, 'FORCE_ESCALATE', collectedData, (dbSession?.attempts ?? 0) + 1);

    return {
      displayText: forceText,
      shouldEscalate: hasPhone,
      collectedData,
      tookMs: Date.now() - startTime,
      systemPrompt,
      rawResponse: forceText,
      extractionMeta,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      newState: 'FORCE_ESCALATE',
    };
  }

  // 11. Derive display text
  // Priority: LLM text > tool error message > derived "Got it! Next question" from remaining fields
  let displayText = result.text?.trim() || '';

  if (!displayText) {
    // LLM returned no text (typical when a tool is called)
    if (toolSucceeded) {
      // Build next question from remaining required fields
      const requiredRemaining = REQUIRED_FIELDS.filter(f => {
        const val = collectedData[f];
        return !val || val.trim().length === 0;
      });

      if (requiredRemaining.length === 0) {
        // All required collected — thank user
        displayText = collectedData.phone
          ? `Thank you! Our team will call you at ${collectedData.phone} within 2 hours with verified profiles matching your requirements.`
          : 'Thank you! Our team will reach out shortly with verified helper profiles.';
      } else {
        // Ask for next required field
        const nextField = requiredRemaining[0];
        const fieldQuestions: Record<string, string> = {
          phone: 'Could you please share your 10-digit mobile number?',
          location: 'Which area in Bengaluru are you looking for help? (e.g., Koramangala, Indiranagar, Whitefield)',
          service_type: 'What type of help do you need? Cooking / Cleaning / Baby Care / Elderly Care',
          schedule: 'Would you prefer a 24-hour Live-in maid (stays at home) or a 12-hour Day maid (morning to evening)?',
        };
        displayText = `Got it! ${fieldQuestions[nextField] || `Could you share your ${nextField}?`}`;
      }
    } else if (toolError) {
      // Tool validation failed — use the error message as display text
      displayText = toolError;
    } else {
      // No tool called, no text — fall back to asking for first missing required field
      const requiredRemaining = REQUIRED_FIELDS.filter(f => {
        const val = collectedData[f];
        return !val || val.trim().length === 0;
      });
      if (requiredRemaining.length > 0) {
        const nextField = requiredRemaining[0];
        const fieldQuestions: Record<string, string> = {
          phone: 'Please share your 10-digit mobile number.',
          location: 'Which area in Bengaluru are you looking for help?',
          service_type: 'What type of help do you need? Cooking / Cleaning / Baby Care / Elderly Care',
          schedule: 'Would you prefer a 24-hour Live-in maid or a 12-hour Day maid?',
        };
        displayText = fieldQuestions[nextField] || 'How can I help you?';
      } else {
        displayText = 'How can I help you?';
      }
    }
  }

  // 12. Apply guardrails to display text
  displayText = applyStrictGuardrails(displayText);

  // 13. Determine shouldEscalate and newState
  let shouldEscalate = false;
  let newState = 'COLLECTING';

  if (escalateCalled) {
    // escalate() tool was called mid-flow
    shouldEscalate = true;
    newState = 'ESCALATED';
  } else if (isComplete(collectedData)) {
    // All required fields collected
    shouldEscalate = true;
    newState = 'COMPLETE';
  } else {
    // Determine next needed required field for current_state tracking
    const requiredRemaining = REQUIRED_FIELDS.filter(f => {
      const val = collectedData[f];
      return !val || val.trim().length === 0;
    });
    if (requiredRemaining.length > 0) {
      newState = `NEED_${requiredRemaining[0].toUpperCase()}`;
    } else {
      // Required done but no complete signal yet (edge case)
      newState = 'NEED_OPTIONAL';
    }
  }

  // 14. Save session to Supabase
  // Increment attempts only on tool validation failures
  const newAttempts = (dbSession?.attempts ?? 0) + (consecutiveFailures > 0 && !toolSucceeded ? 1 : 0);
  await saveAgenticSession(conversationId, newState, collectedData, newAttempts);

  return {
    displayText,
    shouldEscalate,
    collectedData,
    tookMs: Date.now() - startTime,
    systemPrompt,
    rawResponse: result.text || '',
    extractionMeta,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    newState,
  };
}
