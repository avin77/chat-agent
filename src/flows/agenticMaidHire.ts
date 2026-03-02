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
import { isValidPhone, extractPhone, extractLocation, extractWorkType, extractSchedule, extractSalaryRange, extractFamilySize, extractExperience, detectGibberish } from '../extractors/dataExtractor';
import { geminiRateLimiter } from '../lib/rateLimiter';
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
const OPTIONAL_FIELDS = ['salary_range', 'family_size', 'has_experience'] as const;
// ALL_FIELDS: required + optional, in the order we collect them
const ALL_FIELDS: ReadonlyArray<string> = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const TOOL_LOOP_THRESHOLD = 3;
const PER_1K_TOKENS = 0; // Gemma 3 27B is free

// ─── Exact question text per field (mirrors MaidHiringFlow step definitions) ──
const FIELD_QUESTIONS: Record<string, string> = {
  phone: 'Could you please share your 10-digit mobile number?',
  location: 'Which area in Bengaluru are you looking for help? (e.g., Koramangala, Indiranagar, Whitefield)',
  service_type: 'What type of help do you need? Cooking / Cleaning / Baby Care / Elderly Care',
  schedule: 'Would you prefer a 24-hour Live-in maid (stays at home overnight) or a 12-hour Day maid (morning to evening)?',
  salary_range: 'What is your expected salary range? (You can say "skip" to continue.)',
  family_size: 'How many family members are in your household? (You can say "skip" to continue.)',
  has_experience: 'Have you hired a maid or domestic helper before? (You can say "skip" to continue.)',
};

// ─── Compute the next field to ask for, given what is already collected ───────
function getNextField(collectedData: CollectedData): string | null {
  // Required fields first, in order
  for (const f of REQUIRED_FIELDS) {
    const val = collectedData[f];
    if (!val || val.trim().length === 0) return f;
  }
  // Optional fields, in order
  for (const f of OPTIONAL_FIELDS) {
    const val = (collectedData as any)[f];
    if (!val || val.trim().length === 0) return f;
  }
  return null; // All collected
}

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

// ─── generateTextWithRetry ────────────────────────────────────────────────────
// Wraps generateText with:
//   1. geminiRateLimiter.recordRequest() — tracks this call in the shared rate window
//   2. Retry-with-backoff on 429 (Gemini free-tier quota exceeded)
//      - Reads the suggested wait time from the error message (e.g., "retry in 2.234s")
//      - Falls back to DEFAULT_RETRY_WAIT_MS if no wait time found
//      - Retries up to MAX_RETRIES times before re-throwing
const MAX_RETRIES = 3;
const DEFAULT_RETRY_WAIT_MS = 10_000; // 10s default backoff when Gemini doesn't specify

async function generateTextWithRetry(
  model: ReturnType<typeof google>,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<Awaited<ReturnType<typeof generateText>>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Record this request in the shared rate limiter (for observability and RPM tracking)
    geminiRateLimiter.recordRequest();

    try {
      return await generateText({ model, system, messages });
    } catch (err: any) {
      lastError = err;

      const is429 =
        err?.message?.includes('429') ||
        err?.status === 429 ||
        err?.message?.toLowerCase().includes('quota') ||
        err?.message?.toLowerCase().includes('rate limit');

      if (!is429 || attempt === MAX_RETRIES) {
        // Non-retryable error, or exhausted retries — re-throw
        throw err;
      }

      // Extract suggested retry delay from Gemini's error message
      // Format: "Please retry in 2.234752707s." or "retry in Xs"
      let waitMs = DEFAULT_RETRY_WAIT_MS;
      const waitMatch = err?.message?.match(/retry in\s+([\d.]+)\s*s/i);
      if (waitMatch) {
        waitMs = Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500; // add 500ms buffer
      }

      console.warn(
        `[Agentic] 429 rate limit hit (attempt ${attempt}/${MAX_RETRIES}). ` +
        `Waiting ${waitMs}ms before retry...`
      );
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  // Should never reach here (loop always throws or returns), but TypeScript needs it
  throw lastError;
}

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
// Only "complete" when ALL fields (required + optional) have been collected or skipped.
// This ensures we ask optional fields before sending the COMPLETE message.
function isComplete(collectedData: CollectedData): boolean {
  return ALL_FIELDS.every(f => {
    const val = (collectedData as any)[f];
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
// extraAlerts: optional system-level alerts injected before mandatory instruction
// (used for invalid phone warnings, pre-extracted phone acknowledgment, etc.)
function buildAgenticSystemPrompt(collectedData: CollectedData, extraAlerts: string[] = []): string {
  const collectedEntries = Object.entries(collectedData)
    .filter(([k, v]) => !k.startsWith('__') && typeof v === 'string' && v.trim().length > 0)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n');

  const collectedSection = collectedEntries
    ? `COLLECTED DATA:\n${collectedEntries}`
    : 'COLLECTED DATA:\n  (none yet)';

  // Derive the exact next field and question deterministically
  const nextField = getNextField(collectedData);
  const nextQuestion = nextField ? (FIELD_QUESTIONS[nextField] ?? null) : null;

  const allRequiredDone = REQUIRED_FIELDS.every(f => {
    const val = collectedData[f];
    return typeof val === 'string' && val.trim().length > 0;
  });

  // Mandatory instruction block — tells the model exactly what to say next
  let mandatoryInstruction: string;
  if (!nextField) {
    // All fields (required + optional) collected — completion message
    const phone = collectedData.phone?.trim() ?? '';
    mandatoryInstruction = `MANDATORY: All information collected. Your "message" MUST thank the customer and say our team will call them at ${phone || 'the number provided'} within 2 hours with verified profiles. Use action "respond".`;
  } else if (!allRequiredDone) {
    mandatoryInstruction = `MANDATORY NEXT QUESTION: Your "message" MUST end with this exact question (word-for-word):
"${nextQuestion}"

STRICT RULES for this turn:
- You are currently collecting: "${nextField}".
- If the customer's message provides a value for "${nextField}", call save_${nextField} with that value AND include the MANDATORY NEXT QUESTION in your "message".
- If the customer's message does NOT provide "${nextField}", use action "respond" with the MANDATORY NEXT QUESTION.
- Do NOT call save_* for any OTHER field this turn — capture only "${nextField}" now. Other fields will be captured in future turns.`;
  } else {
    // Required done, optional remaining
    mandatoryInstruction = `MANDATORY NEXT QUESTION: All required fields are collected. Now ask for the next optional field. Your "message" MUST end with this exact question (word-for-word):
"${nextQuestion}"
If the customer's message provides a value for "${nextField}" (or says "skip"), call save_${nextField} with that value AND include a brief acknowledgment + the next question.
If user says "skip", call save_${nextField} with value "skipped".`;
  }

  const alertsSection = extraAlerts.length > 0
    ? '\n' + extraAlerts.map(a => `SYSTEM ALERT: ${a}`).join('\n') + '\n'
    : '';

  return `ROLE: EzyBot — domestic help intake assistant for EzyHelpers.com, Bengaluru.

${collectedSection}
${alertsSection}
${mandatoryInstruction}

INSTRUCTIONS:
1. When the customer provides information for any field in COLLECTED DATA, call the appropriate save_* function immediately.
2. Call EXACTLY ONE function per message. NEVER call multiple functions at once.
3. If the customer provides information for a field NOT yet asked (e.g., mentions their area before you asked), call the appropriate save_* function to capture it, then still ask the MANDATORY NEXT QUESTION.
4. If a customer asks about price, cost, or salary: say "Our team will call you to discuss pricing details." then ALWAYS end with the MANDATORY NEXT QUESTION. NEVER give any rupee amounts.
5. If a customer asks a FAQ (process, background verification, etc.), answer briefly in the "message", then ALWAYS end with the MANDATORY NEXT QUESTION.
6. If the customer seems angry, frustrated, or explicitly asks for a human, call escalate.
7. NEVER re-ask for information already in COLLECTED DATA.

RULES:
- Your "message" MUST always end with the MANDATORY NEXT QUESTION (copy it word-for-word).
- Ask EXACTLY ONE question per message.
- NEVER mention specific prices or salary amounts. If asked about price/cost, say "Our team will call you to discuss pricing details."
- NEVER offer to call the customer yourself.
- Keep "message" concise — 1-3 sentences maximum.
- Schedule options: "24-hour Live-in maid" (stays overnight) or "12-hour Day maid" (morning to evening).
- If user says "skip" for an optional field, call save_${nextField ?? 'salary_range'} with value "skipped".

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

  // 3.5. Pre-extract slots from user message using regex (reliable, avoids LLM extraction errors).
  // Pre-extraction is the primary defense against the model failing to call save_* tools.
  // The model (gemma-3-27b-it) frequently acknowledges a value but returns action:"respond"
  // instead of action:"save", which means the field never gets stored. By pre-extracting
  // deterministically BEFORE the LLM call, we ensure fields are saved regardless of LLM behavior.
  const extraAlerts: string[] = [];
  let preExtractedPhone: string | null = null;
  const preExtractedFields: string[] = []; // track which fields were pre-extracted this turn

  // 3.5a. Phone pre-extraction (always, when not yet collected)
  if (!collectedData.phone || collectedData.phone.trim().length === 0) {
    const prePhone = extractPhone(latestMessage);
    if (prePhone) {
      preExtractedPhone = prePhone;
      (collectedData as any).phone = prePhone;
      preExtractedFields.push('phone');
      console.log(`[Agentic Pre-extract] Phone extracted from message: ${prePhone}`);
      // Phone will be acknowledged via the 12b prefix block below — no model alert needed
    } else {
      // Check for partial/invalid phone (5-9 digits) — warn the model not to accept it
      const partialPhone = latestMessage.match(/\b\d{5,9}\b/);
      if (partialPhone) {
        extraAlerts.push(
          `The customer provided "${partialPhone[0]}" which is NOT a valid 10-digit phone number. ` +
          `Do NOT call save_phone. Do NOT say "Thank you" or "Got it" for the phone. ` +
          `Use action "respond" and tell the customer: "Could you please share a valid 10-digit mobile number? (e.g., 9876543210)"`
        );
      }
    }
  }

  // Compute the next expected field at this point (after phone pre-extraction).
  // Used to decide whether to pre-extract location/service_type/schedule.
  const nextFieldAfterPhone = getNextField(collectedData);

  // 3.5b. Location pre-extraction.
  // Pre-extract if: (a) location is the CURRENT next field, OR (b) phone was in the same message
  // (handles multi-slot "I need help in Whitefield, my number is 9876543210").
  // When phone is in the message, only accept SPECIFIC area names (not just "Bengaluru"/"Bangalore")
  // to avoid false positives like "I moved to Bengaluru, my number is 9876543210" extracting
  // generic city as location (user still needs to specify their area).
  if (!collectedData.location || collectedData.location.trim().length === 0) {
    if (nextFieldAfterPhone === 'location' || preExtractedPhone) {
      const preLocation = extractLocation(latestMessage);
      if (preLocation) {
        // Always skip generic city name "Bangalore"/"Bengaluru"/"blr" when phone is co-present
        // in the same message (e.g., "I moved to Bengaluru, my number is 9876543210" should NOT
        // save "Bengaluru" as specific area — we still need to ask which area in Bengaluru).
        // When phone is NOT in this message, accept generic city only if location is already the
        // next field (i.e., phone has already been collected in a prior turn).
        const isGenericCity = /^(bangalore|bengaluru|blr)$/i.test(preLocation.trim());
        const phoneCoPresent = !!preExtractedPhone;
        if (!isGenericCity || (!phoneCoPresent && nextFieldAfterPhone === 'location')) {
          (collectedData as any).location = preLocation;
          preExtractedFields.push('location');
          console.log(`[Agentic Pre-extract] Location extracted: ${preLocation}`);
        } else {
          console.log(`[Agentic Pre-extract] Location skipped (generic city${phoneCoPresent ? ', phone co-present' : ''}): ${preLocation}`);
        }
      }
    }
  }

  // 3.5c. Service type pre-extraction.
  // Pre-extract if: (a) service_type is the CURRENT next field, OR (b) phone was in the same message.
  // Skip if the message is a question (FAQ mid-flow) — service_type keywords appear in FAQs
  // like "Do you provide full-time cooking service?" and we don't want to pre-extract those.
  const isQuestion = /\?/.test(latestMessage);
  if (!collectedData.service_type || collectedData.service_type.trim().length === 0) {
    const nextFieldForService = getNextField(collectedData);
    if ((nextFieldForService === 'service_type' || preExtractedPhone) && !isQuestion) {
      const preServiceType = extractWorkType(latestMessage);
      if (preServiceType) {
        (collectedData as any).service_type = preServiceType;
        preExtractedFields.push('service_type');
        console.log(`[Agentic Pre-extract] Service type extracted: ${preServiceType}`);
      }
    }
  }

  // 3.5d. Schedule pre-extraction.
  // Pre-extract if: (a) schedule is the CURRENT next field, OR (b) phone was in the same message.
  // Skip if the message is a question (FAQ mid-flow) to avoid extracting "full-time" from
  // "What is the salary for full-time cook?" as a schedule slot.
  if (!collectedData.schedule || collectedData.schedule.trim().length === 0) {
    const nextFieldForSchedule = getNextField(collectedData);
    if ((nextFieldForSchedule === 'schedule' || preExtractedPhone) && !isQuestion) {
      const preSchedule = extractSchedule(latestMessage);
      if (preSchedule) {
        (collectedData as any).schedule = preSchedule;
        preExtractedFields.push('schedule');
        console.log(`[Agentic Pre-extract] Schedule extracted: ${preSchedule}`);
      }
    }
  }

  // 3.5e. Optional field pre-extraction (salary_range, family_size, has_experience).
  // Only extract the CURRENT next optional field to avoid over-extraction.
  const currentNextField = getNextField(collectedData);
  if (currentNextField === 'salary_range') {
    const preSalary = extractSalaryRange(latestMessage);
    if (preSalary) {
      (collectedData as any).salary_range = preSalary;
      preExtractedFields.push('salary_range');
      console.log(`[Agentic Pre-extract] Salary range extracted: ${preSalary}`);
    } else {
      // Handle "skip" for optional fields
      const skipPattern = /^(skip|no|na|n\/a|don'?t know|not sure|idk|later|flexible|any|open)$/i;
      if (skipPattern.test(latestMessage.trim())) {
        (collectedData as any).salary_range = 'skipped';
        preExtractedFields.push('salary_range');
        console.log(`[Agentic Pre-extract] Salary range skipped`);
      }
    }
  }
  if (currentNextField === 'family_size') {
    const preFamilySize = extractFamilySize(latestMessage);
    if (preFamilySize) {
      (collectedData as any).family_size = preFamilySize;
      preExtractedFields.push('family_size');
      console.log(`[Agentic Pre-extract] Family size extracted: ${preFamilySize}`);
    } else {
      const skipPattern = /^(skip|no|na|n\/a|don'?t know|not sure|idk|later|flexible|any|open)$/i;
      if (skipPattern.test(latestMessage.trim())) {
        (collectedData as any).family_size = 'skipped';
        preExtractedFields.push('family_size');
        console.log(`[Agentic Pre-extract] Family size skipped`);
      }
    }
  }
  if (currentNextField === 'has_experience') {
    const preExperience = extractExperience(latestMessage);
    if (preExperience) {
      (collectedData as any).has_experience = preExperience;
      preExtractedFields.push('has_experience');
      console.log(`[Agentic Pre-extract] Experience extracted: ${preExperience}`);
    } else {
      const skipPattern = /^(skip|no|na|n\/a|don'?t know|not sure|idk|later|flexible|any|open)$/i;
      if (skipPattern.test(latestMessage.trim())) {
        (collectedData as any).has_experience = 'skipped';
        preExtractedFields.push('has_experience');
        console.log(`[Agentic Pre-extract] Experience skipped`);
      }
    }
  }

  // 3.5f. Gibberish detection — if message is pure gibberish (random chars, symbols only),
  // skip the LLM and return a deterministic confusion message.
  const isGibberish = detectGibberish(latestMessage) && preExtractedFields.length === 0;
  if (isGibberish) {
    const nextFieldForGibberish = getNextField(collectedData);
    const gibberishQuestion = nextFieldForGibberish ? FIELD_QUESTIONS[nextFieldForGibberish] : null;
    const gibberishText = gibberishQuestion
      ? `I didn't catch that. ${gibberishQuestion}`
      : "I didn't catch that. Could you please share your 10-digit mobile number?";

    await saveAgenticSession(conversationId, nextFieldForGibberish ? `NEED_${nextFieldForGibberish.toUpperCase()}` : 'COLLECTING', collectedData, (dbSession?.attempts ?? 0) + 1);

    return {
      displayText: gibberishText,
      shouldEscalate: false,
      collectedData,
      tookMs: Date.now() - startTime,
      systemPrompt: 'GIBBERISH_DETECTED',
      rawResponse: '',
      extractionMeta,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      newState: nextFieldForGibberish ? `NEED_${nextFieldForGibberish.toUpperCase()}` : 'COLLECTING',
    };
  }

  // 3.5g. Invalid phone attempt tracking — increment consecutiveFailures deterministically when:
  //   (a) Phone is still not collected (preExtractedPhone is null), AND
  //   (b) Either:
  //       - The user's message contained at least one sequence of 5+ digits (indicating a phone attempt), OR
  //       - We've already had at least one failure (consecutiveFailures > 0), meaning the bot has
  //         already asked for the phone and the user still hasn't provided a valid one
  //         (handles non-numeric invalid replies like "abcdefghij" after a numeric failure)
  //   This ensures force-escalation triggers after CONSECUTIVE_FAILURE_THRESHOLD bad phone attempts,
  //   even when the LLM correctly follows instructions to return action:"respond" (not action:"save")
  //   for invalid phone values. Without this, consecutiveFailures never increments via the LLM path
  //   and the session resets before force-escalation can fire.
  const phoneStillMissingForEscalation = !collectedData.phone || collectedData.phone.trim().length === 0;
  const hadInvalidPhoneAttempt = !preExtractedPhone && phoneStillMissingForEscalation &&
    (consecutiveFailures > 0 || /\d{5,}/.test(latestMessage));
  if (hadInvalidPhoneAttempt) {
    consecutiveFailures += 1;
    console.log(`[Agentic] Invalid phone attempt — consecutiveFailures now ${consecutiveFailures}`);
    (collectedData as any).__consecutive_failures = String(consecutiveFailures);
    // Check force-escalation immediately (before LLM call) to avoid session reset interference
    if (shouldForceEscalateAgentic(consecutiveFailures)) {
      const forceText = "I'm having trouble with the phone number. Our team is standing by — please call us directly or try again with a valid 10-digit mobile number starting with 6, 7, 8, or 9.";
      await saveAgenticSession(conversationId, 'FORCE_ESCALATE', collectedData, (dbSession?.attempts ?? 0) + 1);
      return {
        displayText: forceText,
        shouldEscalate: false, // no phone → can't escalate to email, but still return a clear message
        collectedData,
        tookMs: Date.now() - startTime,
        systemPrompt: 'FORCE_ESCALATE_PHONE',
        rawResponse: '',
        extractionMeta,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        newState: 'FORCE_ESCALATE',
      };
    }
    // Save the updated consecutive failure count before LLM call
    await saveAgenticSession(conversationId, 'NEED_PHONE', collectedData, dbSession?.attempts ?? 0);
  }

  // 3.6. Fast-path: if any field was pre-extracted AND phone is not the only missing field,
  //      skip the LLM call entirely and return a deterministic response. This avoids:
  //   (a) LLM misinterpreting "Full-time" as a salary value when asking for salary_range
  //   (b) Unnecessary LLM cost/latency when we already know the exact right response
  //      Exception: skip the fast-path if extraAlerts are set (partial phone warning needs LLM).
  if (preExtractedFields.length > 0 && extraAlerts.length === 0) {
    const fastPathNextField = getNextField(collectedData);
    let fastPathText: string;
    if (preExtractedPhone) {
      if (fastPathNextField && FIELD_QUESTIONS[fastPathNextField]) {
        fastPathText = `Thank you for sharing ${preExtractedPhone}! ${FIELD_QUESTIONS[fastPathNextField]}`;
      } else if (!fastPathNextField) {
        fastPathText = `Thank you for sharing ${preExtractedPhone}! Our team will call you within 2 hours with verified profiles matching your requirements.`;
      } else {
        fastPathText = `Thank you for sharing ${preExtractedPhone}! ${FIELD_QUESTIONS[fastPathNextField] ?? ''}`;
      }
    } else {
      if (fastPathNextField && FIELD_QUESTIONS[fastPathNextField]) {
        fastPathText = `Got it! ${FIELD_QUESTIONS[fastPathNextField]}`;
      } else if (!fastPathNextField) {
        const phone = collectedData.phone?.trim() ?? '';
        fastPathText = phone
          ? `Thank you! Our team will call you at ${phone} within 2 hours with verified profiles matching your requirements.`
          : 'Thank you! Our team will reach out shortly with verified helper profiles.';
      } else {
        // Edge case: fallthrough to LLM
        fastPathText = '';
      }
    }

    if (fastPathText) {
      const fastPathComplete = !fastPathNextField;
      const fastPathNewState = fastPathComplete ? 'COMPLETE' : `NEED_${fastPathNextField!.toUpperCase()}`;
      await saveAgenticSession(conversationId, fastPathNewState, collectedData, (dbSession?.attempts ?? 0));
      return {
        displayText: applyStrictGuardrails(fastPathText),
        shouldEscalate: fastPathComplete,
        collectedData,
        tookMs: Date.now() - startTime,
        systemPrompt: 'PRE_EXTRACT_FAST_PATH',
        rawResponse: '',
        extractionMeta,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        newState: fastPathNewState,
      };
    }
  }

  // 4. Build system prompt (includes function definitions + JSON format instruction)
  // Capture the nextField BEFORE calling the model — used in step 8 to enforce that
  // the model only saves the CURRENT requested field (not bonus fields from other turns).
  const nextFieldBeforeModel = getNextField(collectedData);
  const systemPrompt = buildAgenticSystemPrompt(collectedData, extraAlerts);

  // 5. Call generateText() — no tools param (Gemma doesn't support native tool-calling)
  //    Uses retry-with-backoff on 429 (Gemini free-tier token quota).
  //    Errors that exhaust retries propagate to route.ts for single-turn deterministic fallback.
  const result = await generateTextWithRetry(
    google('gemma-3-27b-it'),
    systemPrompt,
    [{ role: 'user', content: latestMessage }],
  );

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
    // Enforce that the model only saves the CURRENTLY requested field.
    // The model sometimes ignores the strict rule and saves bonus fields (e.g., it saves
    // service_type from turn 1 even though we only asked for phone). If it tries to save
    // the wrong field, ignore the save and treat it as an action:"respond".
    const expectedSaveField = nextFieldBeforeModel; // field the system prompt asked for
    const isSavingWrongField =
      parsed.name !== 'escalate' &&               // escalate is always allowed
      expectedSaveField !== null &&                // if we still need fields
      parsed.name !== `save_${expectedSaveField}`; // and model is saving a different one

    if (isSavingWrongField) {
      console.log(`[Agentic] Ignoring save of wrong field: ${parsed.name} (expected save_${expectedSaveField})`);
      // Don't call executeToolCall — treat as "respond" to avoid state corruption
    } else {
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
    if (toolError) {
      displayText = toolError;
    } else {
      // Model returned empty — use the next mandatory question as fallback
      const nf = getNextField(collectedData);
      if (!nf) {
        displayText = collectedData.phone
          ? `Thank you! Our team will call you at ${collectedData.phone} within 2 hours with verified profiles matching your requirements.`
          : 'Thank you! Our team will reach out shortly with verified helper profiles.';
      } else {
        const prefix = toolSucceeded ? 'Got it! ' : '';
        displayText = prefix + (FIELD_QUESTIONS[nf] ?? `Could you share your ${nf}?`);
      }
    }
  }

  // 12b. Pre-extracted field override — when any field was extracted by regex before the LLM call,
  //      build a deterministic, clean response. This ensures:
  //   (a) The correct NEXT field question is always asked (not the field we just captured)
  //   (b) The model's tendency to re-ask the same question is bypassed entirely
  //   (c) For phone: the number always appears in the display (eval requirement)
  if (preExtractedFields.length > 0) {
    const postExtractNextField = getNextField(collectedData);
    if (preExtractedPhone) {
      // Phone was pre-extracted — show phone number in acknowledgment
      if (postExtractNextField && FIELD_QUESTIONS[postExtractNextField]) {
        displayText = `Thank you for sharing ${preExtractedPhone}! ${FIELD_QUESTIONS[postExtractNextField]}`;
      } else if (!postExtractNextField) {
        displayText = `Thank you for sharing ${preExtractedPhone}! Our team will call you within 2 hours with verified profiles matching your requirements.`;
      } else {
        if (!displayText.includes(preExtractedPhone)) {
          displayText = `Thank you for sharing ${preExtractedPhone}! ` + displayText;
        }
      }
    } else {
      // Non-phone field(s) pre-extracted (location, service_type, schedule, optional fields)
      // Build deterministic "Got it! [next question]" response
      if (postExtractNextField && FIELD_QUESTIONS[postExtractNextField]) {
        displayText = `Got it! ${FIELD_QUESTIONS[postExtractNextField]}`;
      } else if (!postExtractNextField) {
        // All fields collected
        const phone = collectedData.phone?.trim() ?? '';
        displayText = phone
          ? `Thank you! Our team will call you at ${phone} within 2 hours with verified profiles matching your requirements.`
          : 'Thank you! Our team will reach out shortly with verified helper profiles.';
      }
      // else: keep model's message (edge case — pre-extracted field but still unclear next step)
    }
  }

  // 12c. Partial/invalid phone guard — if phone is still not collected AND the message had a
  //      partial phone number (5-9 digits), override the display to ONLY ask for a valid 10-digit
  //      number. This prevents the model from saying "Thank you! We have your number" when
  //      the phone is actually invalid.
  const phoneStillMissing = !collectedData.phone || collectedData.phone.trim().length === 0;
  const hadPartialPhone = !preExtractedPhone && /\b\d{5,9}\b/.test(latestMessage);
  if (phoneStillMissing && hadPartialPhone) {
    displayText = 'That number looks incomplete. Could you please share a valid 10-digit mobile number? (e.g., 9876543210)';
  }

  // 13. Apply guardrails
  displayText = applyStrictGuardrails(displayText);

  // 13b. Keyword fallback — if model's message doesn't contain keywords for the NEXT required field,
  //      force-append the exact question. This mirrors the state machine's keyword fallback (route.ts step 9b).
  // IMPORTANT: compute nextFieldForKeyword AFTER tool execution updates collectedData,
  // so we check for the correct NEXT field (e.g., service_type after location was just saved).
  const nextFieldForKeyword = getNextField(collectedData);
  if (nextFieldForKeyword && !isComplete(collectedData)) {
    const fieldKeywords: Record<string, string[]> = {
      phone: ['phone', 'mobile', 'number', '10-digit', 'contact'],
      location: ['area', 'bengaluru', 'bangalore', 'location', 'where', 'locality'],
      // service_type: must contain at least one specific service name (not generic 'help' — too broad)
      service_type: ['cooking', 'cleaning', 'baby care', 'elderly care', 'baby', 'elderly', 'type of help', 'what type'],
      schedule: ['full-time', 'part-time', 'schedule', 'prefer', 'live-in', '24-hour', '12-hour', 'day maid'],
      salary_range: ['salary', 'range', 'budget', 'expect', 'pay'],
      family_size: ['family', 'member', 'household', 'people'],
      has_experience: ['hired', 'experience', 'before', 'maid before', 'helper before'],
    };
    const keywords = fieldKeywords[nextFieldForKeyword] ?? [];
    const lowerDisplay = displayText.toLowerCase();
    const hasKeyword = keywords.some(kw => lowerDisplay.includes(kw));
    if (!hasKeyword && FIELD_QUESTIONS[nextFieldForKeyword]) {
      // Strip trailing question (wrong field question from model) and append the correct one
      displayText = displayText.replace(/\?[^?]*$/, '.').replace(/\.\s*$/, '. ') + FIELD_QUESTIONS[nextFieldForKeyword];
      console.log(`[Agentic Keyword Fallback] Appended correct question for ${nextFieldForKeyword}`);
    }
  }

  // 14. Determine shouldEscalate and newState
  let shouldEscalate = false;
  let newState = 'COLLECTING';

  if (escalateCalled) {
    shouldEscalate = true;
    newState = 'ESCALATED';
  } else if (isComplete(collectedData)) {
    // All required + optional fields collected/skipped — trigger escalation (lead save + email)
    shouldEscalate = true;
    newState = 'COMPLETE';
  } else {
    const nextField = getNextField(collectedData);
    newState = nextField ? `NEED_${nextField.toUpperCase()}` : 'NEED_OPTIONAL';
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
