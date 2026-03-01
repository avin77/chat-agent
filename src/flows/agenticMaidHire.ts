// src/flows/agenticMaidHire.ts
// Phase 2: Agentic maid_hire handler — structured JSON prompting for Gemma 3 27B
//
// Uses manual JSON parsing instead of Vercel AI SDK tool-calling, because
// gemma-3-27b-it does not support the native function-calling protocol.
// The model outputs a single JSON object per turn; we parse it and execute
// the tool locally.  Interface to route.ts is unchanged.
// Gated behind USE_AGENTIC=true env var in route.ts.

import { generateText } from 'ai';
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

// ─── Inline validators ────────────────────────────────────────────────────────
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

// ─── Function definitions embedded in system prompt ───────────────────────────
// Gemma 3 27B does not support the native tool-calling protocol.
// We give it function definitions in text and tell it to output JSON.
const FUNCTION_DEFINITIONS = `AVAILABLE FUNCTIONS:
[
  {"name":"save_phone","description":"Save customer phone when they provide a 10-digit Indian mobile number.","parameters":{"type":"object","properties":{"phone":{"type":"string","description":"Indian mobile number, 10 digits, starts with 6-9. Strip +91/91 prefix if present."}},"required":["phone"]}},
  {"name":"save_location","description":"Save the Bengaluru area or locality when customer provides it.","parameters":{"type":"object","properties":{"location":{"type":"string","description":"Bengaluru area or locality name (e.g. Koramangala, Indiranagar, Whitefield)"}},"required":["location"]}},
  {"name":"save_service_type","description":"Save type of domestic help needed when customer specifies it.","parameters":{"type":"object","properties":{"service_type":{"type":"string","description":"Type of help: Cooking, Cleaning, Baby Care, Elderly Care, or similar"}},"required":["service_type"]}},
  {"name":"save_schedule","description":"Save maid schedule preference when customer specifies it.","parameters":{"type":"object","properties":{"schedule":{"type":"string","description":"24-hour Live-in (stays overnight) or 12-hour Day (morning to evening)"}},"required":["schedule"]}},
  {"name":"save_salary_range","description":"Save expected salary range if customer mentions it. Optional field.","parameters":{"type":"object","properties":{"salary_range":{"type":"string","description":"Expected salary or budget (e.g. 15k, Rs 12000, flexible)"}},"required":["salary_range"]}},
  {"name":"save_family_size","description":"Save number of family members if mentioned. Optional field.","parameters":{"type":"object","properties":{"family_size":{"type":"string","description":"Number of people in household (e.g. 4, family of 3, couple)"}},"required":["family_size"]}},
  {"name":"save_has_experience","description":"Save whether customer has hired a maid before. Optional field.","parameters":{"type":"object","properties":{"has_experience":{"type":"string","description":"Whether they hired domestic help before (Yes/No/details)"}},"required":["has_experience"]}},
  {"name":"escalate","description":"Escalate to human support when customer is angry, frustrated, or explicitly asks for a human.","parameters":{"type":"object","properties":{"reason":{"type":"string","description":"Brief reason for escalation"}},"required":["reason"]}}
]

OUTPUT FORMAT — respond with exactly one JSON object, no other text:
- To save a field and reply: {"action":"save","name":"<function_name>","parameters":{...},"message":"<your friendly reply to continue the conversation>"}
- To just reply without saving: {"action":"respond","message":"<your friendly reply>"}

NEVER output plain text. ALWAYS output valid JSON on a single line.`;

// ─── Parsed response shape ────────────────────────────────────────────────────
interface AgenticResponse {
  action: 'save' | 'respond';
  name?: string;
  parameters?: Record<string, string>;
  message: string;
}

// ─── parseAgenticResponse ─────────────────────────────────────────────────────
// Extracts the JSON object from model output. Returns null if unparseable.
function parseAgenticResponse(text: string): AgenticResponse | null {
  if (!text || !text.trim()) return null;
  // Find the first complete JSON object in the output (model may add markdown fences)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.action !== 'string' || typeof parsed.message !== 'string') return null;
    return parsed as AgenticResponse;
  } catch {
    return null;
  }
}

// ─── executeToolCall ──────────────────────────────────────────────────────────
// Runs the validation logic for a named tool and returns a result.
// Replaces the Vercel AI SDK tool execute() functions.
async function executeToolCall(
  name: string,
  parameters: Record<string, string> = {},
): Promise<{ success: boolean; field?: string; value?: string; error?: string }> {
  switch (name) {
    case 'save_phone': {
      const raw = String(parameters.phone ?? '');
      const normalized = raw.replace(/\D/g, '').slice(-10);
      if (!isValidPhone(normalized)) {
        return { success: false, error: 'Please share a valid 10-digit mobile number (e.g., 9876543210).' };
      }
      return { success: true, field: 'phone', value: normalized };
    }
    case 'save_location': {
      const location = String(parameters.location ?? '');
      if (!validateLocation(location)) {
        return { success: false, error: 'Please share your area in Bengaluru (e.g., Koramangala, Indiranagar, Whitefield).' };
      }
      return { success: true, field: 'location', value: location };
    }
    case 'save_service_type': {
      const service_type = String(parameters.service_type ?? '');
      if (!validateServiceType(service_type)) {
        return { success: false, error: 'Please choose from: Cooking, Cleaning, Baby Care, or Elderly Care.' };
      }
      return { success: true, field: 'service_type', value: service_type };
    }
    case 'save_schedule': {
      const schedule = String(parameters.schedule ?? '');
      if (!validateSchedule(schedule)) {
        return { success: false, error: 'Please let us know — 24-hour Live-in maid or 12-hour Day maid?' };
      }
      return { success: true, field: 'schedule', value: schedule };
    }
    case 'save_salary_range': {
      const salary_range = String(parameters.salary_range ?? '').trim();
      if (!salary_range) {
        return { success: false, error: 'Please share a salary range or say "skip" to continue.' };
      }
      return { success: true, field: 'salary_range', value: salary_range };
    }
    case 'save_family_size': {
      const family_size = String(parameters.family_size ?? '').trim();
      if (!family_size) {
        return { success: false, error: 'How many people are in your family? You can also say "skip".' };
      }
      return { success: true, field: 'family_size', value: family_size };
    }
    case 'save_has_experience': {
      const has_experience = String(parameters.has_experience ?? '').trim();
      if (!has_experience) {
        return { success: false, error: 'Have you hired a maid before? Yes, No, or any details are fine.' };
      }
      return { success: true, field: 'has_experience', value: has_experience };
    }
    case 'escalate': {
      const reason = String(parameters.reason ?? 'Customer requested escalation');
      return { success: true, field: '__escalate', value: reason };
    }
    default:
      return { success: false, error: `Unknown function: ${name}` };
  }
}

// ─── Helper: isComplete ───────────────────────────────────────────────────────
function isComplete(collectedData: CollectedData): boolean {
  return REQUIRED_FIELDS.every(f => {
    const val = collectedData[f];
    return typeof val === 'string' && val.trim().length > 0;
  });
}

// ─── Helper: detectToolLoop ───────────────────────────────────────────────────
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
function buildAgenticSystemPrompt(collectedData: CollectedData): string {
  const collectedEntries = Object.entries(collectedData)
    .filter(([k, v]) => !k.startsWith('__') && typeof v === 'string' && v.trim().length > 0)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n');

  const collectedSection = collectedEntries
    ? `COLLECTED DATA:\n${collectedEntries}`
    : 'COLLECTED DATA:\n  (none yet)';

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
2. When the customer provides information for any field, call the appropriate save_* function immediately.
3. Call EXACTLY ONE function per message. NEVER call multiple functions at once.
4. If the customer provides information you haven't asked for yet, call the appropriate save_* function to capture it.
5. If a customer asks a FAQ (pricing, process, background verification etc.), answer briefly in the "message", then re-ask the current missing required field.
6. If the customer seems angry, frustrated, or explicitly asks for a human, call escalate.
7. After ALL required fields are collected, thank the customer in the "message" and say our team will call them within 2 hours.
8. For optional fields (salary_range, family_size, has_experience), only ask once all required fields are collected.

RULES:
- Ask EXACTLY ONE question per message.
- NEVER mention specific prices or salary amounts.
- NEVER offer to call the customer yourself.
- NEVER ask for information already in COLLECTED DATA.
- Keep "message" concise — 1-3 sentences maximum.
- Schedule options: "24-hour Live-in maid" (stays overnight) or "12-hour Day maid" (morning to evening).

${FUNCTION_DEFINITIONS}`;
}

// ─── Private: saveAgenticSession ─────────────────────────────────────────────
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

  const extractionMeta: ExtractionMeta = {
    sources: {},
    latency_ms: 0,
    llm_raw: null,
    fallback_triggered: false,
  };

  // 1. Load collectedData from DB session
  let collectedData: CollectedData = (dbSession?.collected_data || {}) as CollectedData;

  // 2. Parse consecutive failures
  let consecutiveFailures = parseInt((collectedData as any).__consecutive_failures || '0', 10);
  if (isNaN(consecutiveFailures)) consecutiveFailures = 0;

  // 3. Early return: loop already detected in a previous turn
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

  // 4. Build system prompt (includes function definitions + JSON format instruction)
  const systemPrompt = buildAgenticSystemPrompt(collectedData);

  // 5. Call generateText() — no tools param (Gemma doesn't support native tool-calling)
  //    Errors propagate to route.ts for single-turn deterministic fallback.
  const result = await generateText({
    model: google('gemma-3-27b-it'),
    system: systemPrompt,
    messages: [{ role: 'user', content: latestMessage }],
  });

  // 6. Capture token usage
  const promptTokens = result.usage?.inputTokens ?? 0;
  const completionTokens = result.usage?.outputTokens ?? 0;
  const totalTokens = result.usage?.totalTokens ?? (promptTokens + completionTokens);
  const estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS;

  const rawText = result.text?.trim() || '';

  // 7. Parse the JSON response from the model
  const parsed = parseAgenticResponse(rawText);
  console.log(`[Agentic] Raw: ${rawText.slice(0, 120)} | Parsed action: ${parsed?.action ?? 'null'}`);

  // 8. Execute tool if model chose to save a field
  let escalateCalled = false;
  let toolError: string | undefined;
  let toolSucceeded = false;
  let modelMessage = parsed?.message || rawText; // fallback to raw text if JSON parse failed

  if (parsed?.action === 'save' && parsed.name) {
    // Update tool call count for loop detection
    collectedData = updateToolCallCount(collectedData, parsed.name);

    const toolResult = await executeToolCall(parsed.name, parsed.parameters ?? {});

    if (toolResult.success && toolResult.field && toolResult.value !== undefined) {
      if (toolResult.field === '__escalate') {
        escalateCalled = true;
      } else {
        (collectedData as any)[toolResult.field] = toolResult.value;
      }
      consecutiveFailures = 0;
      toolSucceeded = true;
    } else if (!toolResult.success) {
      // Validator rejected the value — override model's message with the validator error
      consecutiveFailures += 1;
      toolError = toolResult.error;
      modelMessage = toolResult.error || modelMessage;
    }
  }

  // 9. Update consecutive failures in collectedData
  (collectedData as any).__consecutive_failures = String(consecutiveFailures);

  // 10. Check loop detection AFTER updating tool call counts
  if (detectToolLoop(collectedData)) {
    (collectedData as any).__loop_detected = 'true';
    await saveAgenticSession(conversationId, 'LOOP_DETECTED', collectedData, (dbSession?.attempts ?? 0) + 1);
    return {
      displayText: "Let me find the right way to help you. One moment...",
      shouldEscalate: false,
      collectedData,
      tookMs: Date.now() - startTime,
      systemPrompt,
      rawResponse: rawText,
      extractionMeta,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      newState: 'LOOP_DETECTED',
    };
  }

  // 11. Check force escalate (3 consecutive validation failures)
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
      rawResponse: rawText,
      extractionMeta,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      newState: 'FORCE_ESCALATE',
    };
  }

  // 12. Derive display text
  // Priority: validator error (if tool failed) > model's message > fallback questions
  let displayText = modelMessage.trim();

  if (!displayText) {
    // Model returned empty — construct from remaining fields
    if (toolSucceeded) {
      const requiredRemaining = REQUIRED_FIELDS.filter(f => {
        const val = collectedData[f];
        return !val || val.trim().length === 0;
      });

      if (requiredRemaining.length === 0) {
        displayText = collectedData.phone
          ? `Thank you! Our team will call you at ${collectedData.phone} within 2 hours with verified profiles matching your requirements.`
          : 'Thank you! Our team will reach out shortly with verified helper profiles.';
      } else {
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
      displayText = toolError;
    } else {
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

  // 13. Apply guardrails
  displayText = applyStrictGuardrails(displayText);

  // 14. Determine shouldEscalate and newState
  let shouldEscalate = false;
  let newState = 'COLLECTING';

  if (escalateCalled) {
    shouldEscalate = true;
    newState = 'ESCALATED';
  } else if (isComplete(collectedData)) {
    shouldEscalate = true;
    newState = 'COMPLETE';
  } else {
    const requiredRemaining = REQUIRED_FIELDS.filter(f => {
      const val = collectedData[f];
      return !val || val.trim().length === 0;
    });
    if (requiredRemaining.length > 0) {
      newState = `NEED_${requiredRemaining[0].toUpperCase()}`;
    } else {
      newState = 'NEED_OPTIONAL';
    }
  }

  // 15. Save session to Supabase
  const newAttempts = (dbSession?.attempts ?? 0) + (consecutiveFailures > 0 && !toolSucceeded ? 1 : 0);
  await saveAgenticSession(conversationId, newState, collectedData, newAttempts);

  return {
    displayText,
    shouldEscalate,
    collectedData,
    tookMs: Date.now() - startTime,
    systemPrompt,
    rawResponse: rawText,
    extractionMeta,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    newState,
  };
}
