import { google } from '@ai-sdk/google';
import { generateText, createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import * as fs from 'fs';
import { getEnhancedPrompt } from '@/lib/prompts-enhanced';
import { applyStrictGuardrails, validatePhone, extractName } from '@/lib/guardrails';
import { logLLMInteraction, logToConsole } from '@/lib/llm-logger';
import { sendEmail } from '@/lib/email';
import { geminiRateLimiter } from '@/lib/rateLimiter';
import { createClient } from '@supabase/supabase-js';
import { normalizeIntentId, type CanonicalIntentId } from '@/lib/responsePlaybooks';
import { runAgenticTurn } from '@/lib/agentic/runtime';

// State machine imports
import { FlowState, FailureType, SessionState, createSessionState } from '@/flows/BaseFlow';
import { MaidHiringFlow } from '@/flows/MaidHiringFlow';
import {
    extractAllSlots, detectFAQ, detectWrongCity, detectGibberish, detectBacktrack,
} from '@/extractors/dataExtractor';
import { extractAllSlotsWithLLM, mergeWithConflictResolution, buildSourceMap, ExtractionMeta } from '@/extractors/llmExtractor';
import { classifyMessage } from '@/extractors/intentClassifier';
import { runShadowHandler } from '@/lib/shadowHandler';
import { handleMaidHireAgentic } from '@/flows/agenticMaidHire';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 30;
export const runtime = 'nodejs';

// Singleton flow instance
const maidHiringFlow = new MaidHiringFlow();

// ─── State Machine System Prompt ─────────────────────────────────────────────
// This is a NARROW prompt — tells the LLM exactly what to say, not open-ended.
function buildStateMachinePrompt(llmInstruction: string, collectedSoFar: Record<string, string | undefined>): string {
    const collected = Object.entries(collectedSoFar)
        .filter(([, v]) => v && v !== 'skipped')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

    return `ROLE: EzyBot — domestic help intake assistant for EzyHelpers.com, Bengaluru.

COLLECTED SO FAR: ${collected || 'Nothing yet'}

INSTRUCTION: ${llmInstruction}

ABSOLUTE RULES (violating any = failure):
1. Respond ONLY in English. Even if the user speaks Hinglish or another language, keep your response in English.
2. Your response MUST end with the EXACT question from the INSTRUCTION above. Copy it word-for-word.
3. Do NOT ask any other questions. Only the question in the INSTRUCTION.
4. Do NOT offer to call the user. Do NOT say "Would you like our team to call you?"
5. Do NOT summarize or confirm collected data unless the instruction explicitly says to.
6. Do NOT describe services, features, or capabilities unless the instruction says to.
7. Keep response to 1-2 sentences MAXIMUM.
8. NO PRICES — if user asks about cost, say "Our team will discuss pricing when they call you."
9. If instruction says [ESCALATE], include [ESCALATE] at the end.
10. Do NOT output "." alone.
11. If the user shares a salary or budget, acknowledge it without repeating any rupee amount. Say "Got it. Our team can discuss the salary range with you."

EXAMPLES OF CORRECT RESPONSES:
- Instruction: "Ask: Please share your 10-digit mobile number." → "Sure, I'd be happy to help! Please share your 10-digit mobile number."
- Instruction: "Acknowledge phone. Ask: Which area in Bengaluru?" → "Thank you! Which area in Bengaluru are you looking for help?"
- Instruction: "Acknowledge location. Ask: What type of help do you need? Cooking / Cleaning / Baby Care / Elderly Care" → "Great, Koramangala! What type of help do you need? Cooking / Cleaning / Baby Care / Elderly Care"

WRONG (never do this):
- "Great! Could you tell me what kind of help you're looking for?" (wrong question)
- "Thank you! Would you like our team to call you?" (premature completion)
- "We provide verified helpers in Bengaluru!" (unsolicited info)`;
}

// ─── Trim messages ───────────────────────────────────────────────────────────
function trimMessages(messages: any[]): any[] {
    if (messages.length <= 12) return messages;
    return [
        ...messages.slice(0, 2),
        ...messages.slice(-10)
    ];
}

// ─── Intent Detection ────────────────────────────────────────────────────────
function detectIntent(message: string): 'complaint' | 'maid_hire' | 'maid_registration' | 'general' {
    if (!message) return 'general';
    const lower = message.toLowerCase();

    if (/don't|do not|doesn't|never|stop|my friend|my neighbor/.test(lower)) {
        return 'general';
    }

    const hasStrongHireIntent = /need.*maid|hire.*maid|looking for.*maid|want.*maid|need.*cook|hire.*cook|need.*cleaning|hire.*help|book.*maid|get.*maid|send.*maid|i need a maid|i need a cook|need.*helper|want.*helper|hire.*helper|looking for.*helper|i need a helper|need domestic help|full.?time.*cook|part.?time.*cook/.test(lower);
    if (hasStrongHireIntent) return 'maid_hire';

    if (/complaint|issue|problem|angry|upset|bad service|broke|broken|damaged|didn't show|didn't come|not working|rude|misbehav|stole|theft|missing|didn't clean|late|no show/.test(lower)) return 'complaint';

    if (/need.*job|want.*work|looking for.*job|looking for work|register.*helper|register.*maid|register.*cook|i am looking for work/.test(lower) || /\bi am(?:\s+a)?\s+(cook|maid|helper)\b/.test(lower)) return 'maid_registration';

    if (/\b(cleaner|housekeeper|cook|babysitter|caretaker|nanny|ayah|bai|kaam.?wali|domestic help|helper|servant|naukrani)\b/i.test(lower) &&
        /\b(need|want|hire|book|get|looking|find|require|send)\b/i.test(lower)) return 'maid_hire';
    if (/\b(maid|maids)\b/.test(lower) && /\b(hire|need|want|book|get|looking|find)\b/.test(lower)) return 'maid_hire';
    if (/\b(maid|maids|bai|kaam.?wali|cook|helper|servant|naukrani)\b/i.test(lower) && /\b(chahiye|chahata|chahti|chaye|chaiye)\b/i.test(lower)) return 'maid_hire';
    if (/khaana.{0,10}bana/i.test(lower)) return 'maid_hire';
    if (/ghar.{0,5}ka.{0,5}kaam/i.test(lower) && /\b(need|want|chahiye|chahata|chahti|help|looking)\b/i.test(lower)) return 'maid_hire';
    if (/(looking for|need|want|find)\s+(?:a\s+)?(?:someone|person|lady|woman|man|worker|help)\s+.{0,30}(cook|clean|take care|care for|baby|elderly|elder)/i.test(lower)) return 'maid_hire';
    if (/\b(hire|need|want|get)\b.{0,15}\b(made|maed|maeid|maaid)\b/i.test(lower) ||
        /\b(made|maed|maeid|maaid)\b.{0,20}\b(cook|cookin|clean|care|baby|elder)\b/i.test(lower)) return 'maid_hire';
    if (/\b(need|want|hire|get|looking)\b.{0,10}\b(maed|maeid|maaid)\b/i.test(lower)) return 'maid_hire';

    const isQuestion = /\?/.test(lower) ||
        /^(do you|can you|is there|are there|what|how|tell me|i want to know|will you|would you|could you|should i|where|when|why|which|have you|do they)/.test(lower.trim());
    if (isQuestion) return 'general';

    return 'general';
}

function normalizeRuntimeIntent(intent: string | null | undefined): CanonicalIntentId {
    return normalizeIntentId(intent || 'general');
}

function mapDbIntentStack(intentStack: any[] | undefined) {
    return (intentStack || []).map((snapshot) => ({
        intent: normalizeRuntimeIntent(snapshot.intent),
        currentState: snapshot.state || snapshot.currentState || 'START',
        collectedData: snapshot.slots || snapshot.collectedData || {},
        slotAttempts: snapshot.slot_attempts || snapshot.slotAttempts || {},
        repairContext: snapshot.repair_context || snapshot.repairContext || null,
    }));
}

function mapRuntimeIntentStack(intentStack: Array<{
    intent: string;
    currentState: string;
    collectedData: Record<string, string>;
    slotAttempts: Record<string, number>;
    repairContext: string | null;
}>) {
    return intentStack.map((snapshot) => ({
        intent: snapshot.intent,
        state: snapshot.currentState,
        slots: snapshot.collectedData,
        slot_attempts: snapshot.slotAttempts,
        repair_context: snapshot.repairContext,
    }));
}

async function saveSharedRuntimeSession(
    conversationId: string,
    snapshot: {
        activeIntent: string;
        currentState: string;
        collectedData: Record<string, string>;
        slotAttempts: Record<string, number>;
        intentStack: Array<{
            intent: string;
            currentState: string;
            collectedData: Record<string, string>;
            slotAttempts: Record<string, number>;
            repairContext: string | null;
        }>;
        intentHistory: string[];
    },
    extras: { agenticMode?: boolean } = {},
) {
    await supabase
        .from('conversation_sessions')
        .update({
            detected_intent: snapshot.activeIntent,
            current_state: snapshot.currentState,
            collected_data: snapshot.collectedData,
            slot_attempts: snapshot.slotAttempts,
            intent_stack: mapRuntimeIntentStack(snapshot.intentStack),
            intent_history: snapshot.intentHistory,
            last_activity: new Date().toISOString(),
            ...(extras.agenticMode ? { agentic_mode: true } : {}),
        })
        .eq('conversation_id', conversationId);
}

// ─── Session Management ──────────────────────────────────────────────────────
async function getOrCreateSession(conversationId: string, latestMessage: string) {
    try {
        const { data: existingSession, error } = await supabase
            .from('conversation_sessions')
            .select('*')
            .eq('conversation_id', conversationId)
            .single();

        if (error && error.code !== 'PGRST116') {
            try { fs.appendFileSync('chat_debug.log', `[DB Select Error] ${JSON.stringify(error)}\n`); } catch (e) { }
        }

        if (existingSession && !error) {
            const newIntent = detectIntent(latestMessage);
            const currentIntent = normalizeRuntimeIntent(existingSession.detected_intent);

            // Reset COMPLETE, stuck (attempts >= 3), or stale partial sessions
            const SESSION_RESUME_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
            const lastActivity = new Date(existingSession.last_activity || existingSession.created_at).getTime();
            const isStalePartial = currentIntent === 'maid_hire' &&
                existingSession.current_state !== 'START' &&
                existingSession.current_state !== 'COMPLETE' &&
                Date.now() - lastActivity > SESSION_RESUME_TIMEOUT_MS;
            // Agentic sessions manage their own failure handling (force-escalate after 3 consecutive
            // validation failures via __consecutive_failures). The generic attempts >= 3 reset must
            // NOT fire for agentic sessions — it would wipe collectedData (including phone) after
            // 3 failed save_location calls, causing silent data loss mid-flow.
            const isAgenticSession = existingSession.agentic_mode === true;
            const isStuck = existingSession.current_state === 'COMPLETE' ||
                (currentIntent === 'maid_hire' && !isAgenticSession && (existingSession.attempts ?? 0) >= 3) ||
                isStalePartial;
            if (isStuck) {
                const reason = existingSession.current_state === 'COMPLETE' ? 'COMPLETE'
                    : (existingSession.attempts ?? 0) >= 3 ? `stuck(attempts=${existingSession.attempts})`
                    : `stale(${Math.round((Date.now() - lastActivity) / 3600000)}h old)`;
                console.log(`[Session] Resetting ${reason} session for ${conversationId}`);
                await supabase
                    .from('conversation_sessions')
                    .update({
                        current_state: 'START',
                        collected_data: {},
                        attempts: 0,
                        slot_attempts: {},
                        detected_intent: currentIntent,
                        last_activity: new Date().toISOString()
                    })
                    .eq('conversation_id', conversationId);
                return {
                    intent: currentIntent,
                    session: { ...existingSession, detected_intent: currentIntent, current_state: 'START', collected_data: {}, attempts: 0, slot_attempts: {} },
                };
            }

            const isMidFlow = currentIntent !== 'general' &&
                existingSession.current_state &&
                existingSession.current_state !== 'START' &&
                existingSession.current_state !== 'COMPLETE';

            if (newIntent !== 'general' && newIntent !== currentIntent) {
                console.log(`[Session] Intent switch detected: ${currentIntent} -> ${newIntent}`);
                
                const updatedStack = [...(existingSession.intent_stack || [])];
                const updatedHistory = [...(existingSession.intent_history || []), newIntent];

                // If mid-flow, push current state to stack
                if (isMidFlow) {
                    console.log(`[Session] Pushing current intent ${currentIntent} to stack`);
                    updatedStack.push({
                        intent: currentIntent,
                        state: existingSession.current_state,
                        slots: existingSession.collected_data,
                        slot_attempts: existingSession.slot_attempts || {},
                    });
                }

                await supabase
                    .from('conversation_sessions')
                    .update({
                        detected_intent: newIntent,
                        current_state: 'START',
                        collected_data: {},
                        attempts: 0,
                        slot_attempts: {},
                        intent_stack: updatedStack,
                        intent_history: updatedHistory,
                        last_activity: new Date().toISOString()
                    })
                    .eq('conversation_id', conversationId);

                return { 
                    intent: newIntent, 
                    session: { 
                        ...existingSession, 
                        detected_intent: newIntent, 
                        current_state: 'START', 
                        collected_data: {}, 
                        attempts: 0,
                        slot_attempts: {},
                        intent_stack: updatedStack,
                        intent_history: updatedHistory
                    } 
                };
            }

            await supabase
                .from('conversation_sessions')
                .update({ last_activity: new Date().toISOString(), detected_intent: currentIntent })
                .eq('conversation_id', conversationId);

            return {
                intent: currentIntent,
                session: { ...existingSession, detected_intent: currentIntent },
            };
        }

        const intent = detectIntent(latestMessage);
        const { error: insertError } = await supabase
            .from('conversation_sessions')
            .insert({
                conversation_id: conversationId,
                detected_intent: intent,
                current_state: 'START',
                collected_data: {},
                attempts: 0,
                slot_attempts: {},
                intent_stack: [],
                intent_history: [intent]
            });

        if (insertError) {
            try { fs.appendFileSync('chat_debug.log', `[DB Insert Error] ${JSON.stringify(insertError)}\n`); } catch (e) { }
        }

        return { intent, session: null };
    } catch (err) {
        try { fs.appendFileSync('chat_debug.log', `[Session Error] ${JSON.stringify(err)}\n`); } catch (e) { }
        return { intent: detectIntent(latestMessage), session: null };
    }
}

// ─── Load state machine session from DB ──────────────────────────────────────
function loadStateMachineSession(conversationId: string, dbSession: any): SessionState {
    if (dbSession && dbSession.current_state) {
        const normalizedIntent = normalizeRuntimeIntent(dbSession.detected_intent);
        return {
            conversationId,
            intent: normalizedIntent,
            currentState: (dbSession.current_state as FlowState) || FlowState.START,
            collectedData: dbSession.collected_data || {},
            attempts: dbSession.attempts || 0,
            slot_attempts: dbSession.slot_attempts || {},
            lastMessage: '',
            createdAt: dbSession.created_at || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            intent_stack: dbSession.intent_stack || [],
            intent_history: dbSession.intent_history || [normalizedIntent],
        };
    }
    return createSessionState(conversationId, normalizeRuntimeIntent(dbSession?.detected_intent || 'maid_hire'));
}

// ─── Save state machine session to DB ────────────────────────────────────────
async function saveStateMachineSession(conversationId: string, state: FlowState, collectedData: Record<string, any>, attempts: number, slot_attempts: Record<string, number>) {
    try {
        await supabase
            .from('conversation_sessions')
            .update({
                current_state: state,
                collected_data: collectedData,
                attempts,
                slot_attempts,
                last_activity: new Date().toISOString(),
            })
            .eq('conversation_id', conversationId);
    } catch (err) {
        try { fs.appendFileSync('chat_debug.log', `[State Save Error] ${JSON.stringify(err)}\n`); } catch (e) { }
    }
}

// ─── Handle maid_hire via state machine ──────────────────────────────────────
async function handleMaidHireStateMachine(
    conversationId: string,
    latestMessage: string,
    coreMessages: any[],
    dbSession: any,
): Promise<{ displayText: string; shouldEscalate: boolean; collectedData: Record<string, any>; tookMs: number; systemPrompt: string; rawResponse: string; extractionMeta: ExtractionMeta; promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number; newState: string }> {
    const startTime = Date.now();

    // 1. Load session state
    const session = loadStateMachineSession(conversationId, dbSession);

    // 2. Extract all possible slots from user message — LLM first, regex fallback
    const extractionStart = Date.now();
    let extractedSlots: import('@/extractors/dataExtractor').ExtractedSlots;
    let extractionMeta: ExtractionMeta;

    try {
        // Record rate limit usage for the extraction LLM call (second Gemini call per turn)
        geminiRateLimiter.recordRequest();

        // 10-second hard timeout — free Gemini 27B has 30 RPM limit
        const llmPromise = extractAllSlotsWithLLM(latestMessage);
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('LLM extraction timeout after 10s')), 10_000)
        );

        const llmSlots = await Promise.race([llmPromise, timeoutPromise]);
        const regexSlots = extractAllSlots(latestMessage);
        const latencyMs = Date.now() - extractionStart;

        // Apply conflict resolution: phone→regex wins, all other fields→LLM wins on conflict
        extractedSlots = mergeWithConflictResolution(llmSlots, regexSlots);

        extractionMeta = {
            sources: buildSourceMap(extractedSlots, llmSlots),
            latency_ms: latencyMs,
            llm_raw: llmSlots,
            fallback_triggered: false,
        };
    } catch (err) {
        console.error('[LLM Extraction] Fallback triggered:', (err as Error).message);
        extractedSlots = extractAllSlots(latestMessage);
        extractionMeta = {
            sources: {},
            latency_ms: Date.now() - extractionStart,
            llm_raw: null,
            fallback_triggered: true,
        };
    }

    // 3. Detect special conditions
    const faqDetected = detectFAQ(latestMessage);
    const wrongCity = detectWrongCity(latestMessage);
    const isGibberish = detectGibberish(latestMessage);
    const backtrackSlot = detectBacktrack(latestMessage);

    // 3.5 — Intent classification (for confusion tracking)
    // Skip at START (haven't asked anything yet) and COMPLETE (flow done)
    let classification = 'unknown';
    if (session.currentState !== FlowState.START && session.currentState !== FlowState.COMPLETE) {
        try {
            geminiRateLimiter.recordRequest(); // Track this Gemini call
            classification = await classifyMessage(latestMessage, session.currentState);
        } catch {
            classification = 'unknown'; // classifyMessage already catches internally, extra safety
        }
    }

    // Update confusion counter in collectedData (stored as __confusion key)
    const isIrrelevant = ['off_topic', 'new_intent', 'abusive'].includes(classification);
    const currentConfusion = parseInt((session.collectedData as any).__confusion || '0', 10);
    const newConfusion = isIrrelevant ? currentConfusion + 1 : 0;
    // Store updated confusion count back to session so processMessage has it
    (session.collectedData as any).__confusion = String(newConfusion);

    // After 2+ consecutive irrelevant messages, or 3+ failed attempts for a specific slot, trigger pivot
    const currentStep = maidHiringFlow.getStepForState(session.currentState);
    const slotFailures = currentStep ? (session.slot_attempts[currentStep.slotName] || 0) : 0;
    const triggerConfusionResponse = newConfusion >= 2 || slotFailures >= 3;

    // 4. Run state machine
    const result = maidHiringFlow.processMessage(
        session,
        latestMessage,
        extractedSlots as unknown as Record<string, string | null>,
        faqDetected,
        wrongCity,
        isGibberish,
        backtrackSlot,
    );

    // 4.5 — Override instruction if confusion threshold reached
    if (triggerConfusionResponse) {
        const reason = slotFailures >= 3 ? `repeated failures for ${currentStep?.slotName}` : `${newConfusion} off-topic responses`;
        console.log(`[Confusion Pivot] Triggered due to ${reason}`);
        
        result.llmInstruction = `The user is having trouble (Reason: ${reason}). Gently say: "It looks like we're having a bit of trouble with this step. Would you like to start over with a new request, or shall I connect you with our support team to help you finish?" Do NOT re-ask the current question.`;
        
        // Reset counters after offering pivot
        (session.collectedData as any).__confusion = '0';
        result.collectedData = { ...result.collectedData, __confusion: '0' };
        if (currentStep) {
            session.slot_attempts[currentStep.slotName] = 0;
        }
    }

    // 5. Check force escalate (too many attempts)
    if (maidHiringFlow.shouldForceEscalate(result.attempts)) {
        const forceText = "I'm having trouble understanding. Let me connect you with our team. They'll call you shortly to help.";
        await saveStateMachineSession(conversationId, result.newState, result.collectedData, result.attempts, session.slot_attempts);
        return {
            displayText: forceText,
            shouldEscalate: true,
            collectedData: result.collectedData,
            tookMs: Date.now() - startTime,
            systemPrompt: 'FORCE_ESCALATE',
            rawResponse: forceText,
            extractionMeta,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            newState: result.newState,
        };
    }

    // 6. Build narrow prompt for LLM
    const systemPrompt = buildStateMachinePrompt(result.llmInstruction, result.collectedData);

    // 7. Call LLM with narrow prompt (only last message — full history makes LLM go off-script)
    let llmText: string;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;
    try {
        const { text, usage } = await generateText({
            model: google('gemma-3-27b-it'),
            system: systemPrompt,
            messages: [{ role: 'user', content: latestMessage }],
        });
        llmText = text;
        promptTokens = usage?.inputTokens ?? 0;
        completionTokens = usage?.outputTokens ?? 0;
        totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);
        // gemma-3-27b-it is FREE as of 2026-02. Placeholder formula for future pricing.
        const PER_1K_TOKENS = 0;
        estimatedCostUsd = (totalTokens / 1000) * PER_1K_TOKENS;
    } catch (llmError: any) {
        // LLM call failed — build clean fallback from state machine step definitions
        console.error('[State Machine] LLM call failed:', llmError.message);

        // Log the actual error to Supabase for debugging
        try {
            await logLLMInteraction({
                conversationId,
                intent: 'SYSTEM_ERROR',
                systemPrompt: `LLM_FALLBACK: ${llmError.message?.substring(0, 500)}`,
                userMessage: latestMessage,
                fullHistory: [],
                rawResponse: `ERROR: ${llmError.message?.substring(0, 500)}`,
                cleanedResponse: '',
                tookMs: Date.now() - startTime,
            });
        } catch { /* ignore logging errors */ }

        // Build professional fallback from step definitions (no regex hacking)
        const step = maidHiringFlow.getStepForState(result.newState);

        if (result.isComplete) {
            llmText = `Thank you! Our team will call you at ${result.collectedData.phone} within 2 hours with verified profiles matching your requirements.`;
        } else if (result.newState === FlowState.ASK_PHONE && session.currentState === FlowState.START) {
            llmText = `Welcome to EzyHelpers! I'd be happy to help you find domestic help. ${step?.question || "Please share your 10-digit mobile number."}`;
        } else if (result.failureType === FailureType.FAQ_MID_FLOW) {
            llmText = `Our team can help with that. ${step?.question || ''}`;
        } else if (result.failureType === FailureType.WRONG_CITY) {
            llmText = `We currently operate in Bengaluru only. We're expanding soon! ${step?.question || "Please share your 10-digit mobile number."}`;
        } else if (result.failureType === FailureType.GIBBERISH) {
            llmText = `I didn't catch that. ${step?.question || ''}`;
        } else if (result.failureType === FailureType.INVALID_SLOT) {
            const invalidSlotMessage = typeof step?.errorMessage === 'function'
                ? step.errorMessage(result.attempts)
                : step?.errorMessage;
            llmText = invalidSlotMessage || "I didn't understand that. Could you please try again?";
        } else if (Object.keys(result.slotsExtracted).length > 0) {
            llmText = `Got it! ${step?.question || ''}`;
        } else {
            llmText = step?.question || "Could you please share your details so we can help you?";
        }
    }

    // 8. Safety net for empty/broken responses
    if (!llmText || llmText.trim().length < 4 || /^[\.\,\!\?\s]+$/.test(llmText)) {
        const step = maidHiringFlow.getStepForState(result.newState);
        llmText = step ? step.question : "Could you please share your details so we can help you?";
    }

    // 9. Apply guardrails
    let cleaned = applyStrictGuardrails(llmText);

    // 9c. Intent Resume Logic
    if (result.isComplete && session.intent_stack && session.intent_stack.length > 0) {
        const resumedIntent = session.intent_stack[session.intent_stack.length - 1];
        const updatedStack = session.intent_stack.slice(0, -1);
        
        console.log(`[Session] Flow ${session.intent} complete. Resuming ${resumedIntent.intent} from stack.`);
        
        // Update database with resumed state
        await supabase
            .from('conversation_sessions')
            .update({
                detected_intent: resumedIntent.intent,
                current_state: resumedIntent.state,
                collected_data: resumedIntent.slots,
                intent_stack: updatedStack,
                last_activity: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        // Prepend resume message
        const resumeIntro = `Now that we've handled that, let's get back to your ${resumedIntent.intent.replace('_', ' ')} request. `;
        cleaned = resumeIntro + cleaned;
    }

    // 9b. Keyword fallback — if LLM didn't ask the right question, force-append it
    if (result.newState !== FlowState.COMPLETE && result.newState !== FlowState.START) {
        const stateKeywords: Record<string, string[]> = {
            [FlowState.ASK_PHONE]: ['phone', 'mobile', 'number', '10-digit', 'contact'],
            [FlowState.ASK_LOCATION]: ['area', 'bengaluru', 'bangalore', 'location', 'where', 'locality'],
            [FlowState.ASK_SERVICE]: ['type', 'cooking', 'cleaning', 'baby', 'elderly', 'help', 'service'],
            [FlowState.ASK_SCHEDULE]: ['full-time', 'part-time', 'schedule', 'prefer', 'live-in', '24-hour', '12-hour', 'day maid'],
            [FlowState.ASK_SALARY]: ['salary', 'range', 'budget', 'expect', 'pay'],
            [FlowState.ASK_FAMILY]: ['family', 'member', 'household', 'people'],
            [FlowState.ASK_EXPERIENCE]: ['hired', 'experience', 'before', 'maid before', 'helper before'],
        };

        const keywords = stateKeywords[result.newState];
        if (keywords) {
            const lower = cleaned.toLowerCase();
            const hasKeyword = keywords.some(kw => lower.includes(kw));
            if (!hasKeyword) {
                const step = maidHiringFlow.getStepForState(result.newState);
                if (step) {
                    // Remove trailing question mark section (wrong question) and append correct one
                    cleaned = cleaned.replace(/\?[^?]*$/, '.').replace(/\.\s*$/, '. ') + step.question;
                    console.log(`[Keyword Fallback] Appended correct question for ${result.newState}`);
                }
            }
        }
    }

    // 10. Save state to DB
    await saveStateMachineSession(conversationId, result.newState, result.collectedData, result.attempts, session.slot_attempts);

    // 11. Log state transition
    try {
        fs.appendFileSync('chat_debug.log',
            `[STATE] ${session.currentState} → ${result.newState} | ` +
            `failure=${result.failureType} | slots=${JSON.stringify(result.slotsExtracted)} | ` +
            `advance=${result.shouldAdvance} | escalate=${result.shouldEscalate}\n`
        );
    } catch (e) { }

    const displayText = cleaned.replace(/\[?ESCALATE\]?/gi, '').trim();

    return {
        displayText,
        shouldEscalate: result.shouldEscalate || result.isComplete,
        collectedData: result.collectedData,
        tookMs: Date.now() - startTime,
        systemPrompt,
        rawResponse: llmText,
        extractionMeta,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
        newState: result.newState,
    };
}

// ─── Main POST Handler ───────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const json = await req.json();

        try {
            fs.appendFileSync('chat_debug.log', JSON.stringify(json, null, 2) + '\n---\n');
        } catch (e) { }

        const { messages, id } = json;

        if (!messages || !Array.isArray(messages)) {
            return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400 });
        }

        // Rate limiting
        const rateLimitStatus = geminiRateLimiter.canMakeRequest();
        if (!rateLimitStatus.allowed) {
            return new Response(JSON.stringify({
                error: 'Rate Limit Exceeded',
                waitMs: rateLimitStatus.waitMs,
            }), { status: 429 });
        }

        geminiRateLimiter.recordRequest();

        const lastMsg = messages[messages.length - 1];
        const latestMessage = lastMsg?.content || lastMsg?.parts?.find((p: any) => p.type === 'text')?.text || '';
        const fullConversationText = messages
            .filter((m: any) => m.role === 'user')
            .map((m: any) => m.content || m.parts?.find((p: any) => p.type === 'text')?.text || '')
            .join(' ');
        const conversationId = req.headers.get('x-conversation-id') || id || crypto.randomUUID();

        try {
            fs.appendFileSync('chat_debug.log', `DEBUG_SESSION: ResolvedID: ${conversationId} BodyID: ${id} HeaderID: ${req.headers.get('x-conversation-id')}\n`);
        } catch (e) { }

        // Get intent from session
        // Use latestMessage (not fullConversationText) to avoid false intent switches:
        // Combined history text can trigger maid_hire patterns on maid_registration or general sessions
        // (e.g., "looking for work as a cook" → on turn 2, the combined text has "cook" + "looking"
        // which matches the broader maid_hire pattern and incorrectly resets the session intent).
        const { intent, session: dbSession } = await getOrCreateSession(conversationId, latestMessage);

        // Sanitize messages
        const coreMessages = messages.map((m: any) => ({
            role: m.role,
            content: m.content || m.parts?.find((p: any) => p.type === 'text')?.text || '.',
        }));

        // ═══════════════════════════════════════════════════════════════════════
        // MAID HIRE: Agentic (USE_AGENTIC=true) or deterministic state machine
        // ═══════════════════════════════════════════════════════════════════════
        if (intent === 'maid_hire') {
            const useAgentic = process.env.USE_AGENTIC === 'true';
            // If loop was detected in a previous agentic turn, fall back to deterministic for this turn
            const loopDetected = dbSession?.collected_data?.__loop_detected === 'true';
            const useAgenticThisTurn = useAgentic && !loopDetected;

            // ── Shared escalation + response helper ──────────────────────────
            // Extracted to avoid duplicating the large escalation block in the catch.
            const handleMaidHireSuccess = async (
                displayText: string,
                shouldEscalate: boolean,
                collectedData: Record<string, any>,
                tookMs: number,
                systemPrompt: string,
                rawResponse: string,
                extractionMeta: ExtractionMeta,
                promptTokens: number,
                completionTokens: number,
                totalTokens: number,
                estimatedCostUsd: number,
                newState: string,
                collectedVia: 'agentic' | 'state_machine',
            ) => {
                // Log to Supabase
                try {
                    await logLLMInteraction({
                        conversationId,
                        intent: 'maid_hire',
                        systemPrompt,
                        userMessage: latestMessage,
                        fullHistory: trimMessages(coreMessages),
                        rawResponse,
                        cleanedResponse: displayText,
                        tookMs,
                        extractionMeta,
                        promptTokens,
                        completionTokens,
                        totalTokens,
                        estimatedCostUsd,
                    });
                } catch (logError) {
                    console.error('Logging failed:', logError);
                }

                // Escalation: save lead to DB + send email
                if (shouldEscalate) {
                    let alreadyEscalated = false;
                    try {
                        const { data } = await supabase.from('leads').select('id').eq('conversation_id', conversationId).maybeSingle();
                        alreadyEscalated = !!data;
                    } catch { }

                    if (!alreadyEscalated) {
                        try {
                            const { error: dbError } = await supabase.from('leads').insert({
                                name: collectedData.name || null,
                                phone: collectedData.phone || null,
                                location: collectedData.location || null,
                                service_type: collectedData.service_type || null,
                                schedule: collectedData.schedule || null,
                                salary_expectation: collectedData.salary_range || null,
                                family_size_text: collectedData.family_size || null,
                                has_prior_experience: collectedData.has_experience || null,
                                conversation_id: conversationId,
                                full_conversation: coreMessages,
                                collected_via: collectedVia,
                            });

                            if (dbError) {
                                console.error('Lead insert failed:', dbError);
                                try { fs.appendFileSync('chat_debug.log', `[LEAD DB ERROR] ${JSON.stringify(dbError)}\n`); } catch (e) { }
                            } else {
                                console.log(`Lead saved via ${collectedVia}`);
                            }

                            // Send email
                            const esc = (s: string | null | undefined) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                            const adminEmail = process.env.ADMIN_EMAIL;
                            if (adminEmail) {
                                try {
                                    await sendEmail({
                                        to: adminEmail!,
                                        subject: `New Maid Hire Lead: ${collectedData.name || 'Unknown'} - ${collectedData.phone || 'No phone'}`,
                                        html: `
                                            <h2>New Maid Hire Lead (${collectedVia === 'agentic' ? 'Agentic' : 'State Machine'})</h2>
                                            <p><strong>Phone:</strong> ${esc(collectedData.phone)}</p>
                                            <p><strong>Location:</strong> ${esc(collectedData.location)}</p>
                                            <p><strong>Service:</strong> ${esc(collectedData.service_type)}</p>
                                            <p><strong>Schedule:</strong> ${esc(collectedData.schedule)}</p>
                                            <p><strong>Salary:</strong> ${esc(collectedData.salary_range)}</p>
                                            <p><strong>Family Size:</strong> ${esc(collectedData.family_size)}</p>
                                            <p><strong>Experience:</strong> ${esc(collectedData.has_experience)}</p>
                                            <p><strong>Name:</strong> ${esc(collectedData.name)}</p>
                                            <hr>
                                            <p><strong>Conversation ID:</strong> ${esc(conversationId)}</p>
                                        `
                                    });
                                } catch (emailError) {
                                    console.error('Email failed (non-fatal):', emailError);
                                }
                            }
                        } catch (escalationError) {
                            console.error('Escalation failed:', escalationError);
                        }
                    }
                }

                // Return response
                const textId = crypto.randomUUID();
                const uiStream = createUIMessageStream({
                    execute: ({ writer }) => {
                        writer.write({ type: 'text-start', id: textId });
                        writer.write({ type: 'text-delta', delta: displayText, id: textId });
                        writer.write({ type: 'metadata', data: { handledIntent: 'maid_hire', newState }, id: textId });
                        writer.write({ type: 'text-end', id: textId });
                    },
                });
                const response = createUIMessageStreamResponse({ stream: uiStream });

                // Fire shadow handler async (fire and forget — zero latency impact)
                // Pass pre-computed state data to avoid race condition from DB re-read
                runShadowHandler(
                    conversationId,
                    (dbSession?.attempts ?? 0) + 1,
                    dbSession?.detected_intent || intent,
                    latestMessage,
                    dbSession?.current_state ?? 'START',   // state BEFORE this turn
                    dbSession?.collected_data ?? {},        // slots BEFORE this turn
                    newState,                               // prod decision: next state
                    collectedData,                          // prod decision: slots after
                    dbSession?.intent_stack || [],
                    dbSession?.intent_history || [intent],
                ).catch(err => console.error('[Shadow] Failed:', (err as Error).message));

                return response;
            };

            try {
                const { displayText, shouldEscalate, collectedData, tookMs, systemPrompt, rawResponse, extractionMeta, promptTokens, completionTokens, totalTokens, estimatedCostUsd, newState } =
                    useAgenticThisTurn
                        ? await handleMaidHireAgentic(conversationId, latestMessage, coreMessages, dbSession)
                        : await handleMaidHireStateMachine(conversationId, latestMessage, coreMessages, dbSession);

                return await handleMaidHireSuccess(
                    displayText, shouldEscalate, collectedData, tookMs, systemPrompt, rawResponse,
                    extractionMeta, promptTokens, completionTokens, totalTokens, estimatedCostUsd, newState,
                    useAgenticThisTurn ? 'agentic' : 'state_machine',
                );
            } catch (agenticError: any) {
                if (useAgenticThisTurn) {
                    // CONTEXT.md Failure & Fallback: Gemini API error (timeout/500) during agentic turn →
                    // fall back to deterministic handler for this single turn only.
                    // Agentic mode resumes on the next turn (session state is preserved by handleMaidHireAgentic
                    // only on success, so no partial state corruption occurs).
                    console.warn('[Agentic Error] Falling back to deterministic for this turn:', agenticError.message);
                    try {
                        const { displayText, shouldEscalate, collectedData, tookMs, systemPrompt, rawResponse, extractionMeta, promptTokens, completionTokens, totalTokens, estimatedCostUsd, newState } =
                            await handleMaidHireStateMachine(conversationId, latestMessage, coreMessages, dbSession);

                        return await handleMaidHireSuccess(
                            displayText, shouldEscalate, collectedData, tookMs, systemPrompt, rawResponse,
                            extractionMeta, promptTokens, completionTokens, totalTokens, estimatedCostUsd, newState,
                            'state_machine',
                        );
                    } catch (smFallbackError: any) {
                        console.error('[Fallback SM Error] Both agentic and deterministic handlers failed:', smFallbackError);
                        // Fall through to standard LLM flow below
                    }
                } else {
                    console.error('[Maid Hire Error] Falling back to LLM-only:', agenticError);
                    // Fall through to standard LLM flow (unchanged behavior when useAgenticThisTurn=false)
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // ALL OTHER INTENTS: Standard LLM flow (complaint, maid_registration, general)
        // ═══════════════════════════════════════════════════════════════════════
        const runtimeStartTime = Date.now();
        const runtimeDecision = await runAgenticTurn({
            activeIntent: intent,
            currentState: dbSession?.current_state || 'START',
            collectedData: { ...(dbSession?.collected_data || {}) },
            slotAttempts: { ...(dbSession?.slot_attempts || {}) },
            intentStack: mapDbIntentStack(dbSession?.intent_stack),
            intentHistory: dbSession?.intent_history || [intent],
            runtimeMode: 'live_commit',
            userMessage: latestMessage,
            history: trimMessages(coreMessages),
        });

        await saveSharedRuntimeSession(conversationId, runtimeDecision.sessionSnapshot);

        const runtimeDisplayText = applyStrictGuardrails(runtimeDecision.displayText);
        const runtimeIntent = runtimeDecision.completedIntent || runtimeDecision.handledIntent;
        const runtimePhone = runtimeDecision.sessionSnapshot.collectedData.contact ||
            runtimeDecision.sessionSnapshot.collectedData.phone ||
            validatePhone(latestMessage);
        const runtimeName = extractName(latestMessage);
        const runtimeTelemetry = {
            runtime: 'shared_agentic',
            handledIntent: runtimeDecision.handledIntent,
            completedIntent: runtimeDecision.completedIntent,
            resumedIntent: runtimeDecision.resumedIntent,
            acceptedSlots: runtimeDecision.acceptedSlots,
            rejectedSlots: runtimeDecision.rejectedSlots,
            sessionSnapshot: runtimeDecision.sessionSnapshot,
            thoughtReflection: runtimeDecision.thoughtReflection,
            confidenceScore: runtimeDecision.confidenceScore,
        };

        try {
            await logLLMInteraction({
                conversationId,
                intent: runtimeIntent,
                systemPrompt: 'SHARED_AGENTIC_RUNTIME',
                userMessage: latestMessage,
                fullHistory: trimMessages(coreMessages),
                rawResponse: JSON.stringify(runtimeTelemetry),
                cleanedResponse: runtimeDisplayText,
                tookMs: Date.now() - runtimeStartTime,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                estimatedCostUsd: 0,
                telemetryMeta: runtimeTelemetry,
                thoughtReflection: runtimeDecision.thoughtReflection,
                confidenceScore: runtimeDecision.confidenceScore,
            });
        } catch (logError) {
            console.error('Logging failed:', logError);
        }

        let alreadyEscalated = false;
        try {
            const tableMap: Record<string, string> = {
                complaint: 'complaints',
                maid_registration: 'helper_registrations',
            };
            const table = tableMap[runtimeIntent];
            if (table) {
                const { data } = await supabase.from(table).select('id').eq('conversation_id', conversationId).maybeSingle();
                alreadyEscalated = !!data;
            }
        } catch { }

        if (runtimeDecision.shouldEscalate && !alreadyEscalated) {
            try {
                let dbError = null;

                if (runtimeIntent === 'complaint') {
                    const { error } = await supabase.from('complaints').insert({
                        name: runtimeName,
                        phone: runtimePhone,
                        issue_description: runtimeDecision.sessionSnapshot.collectedData.issue_summary || latestMessage,
                        conversation_id: conversationId,
                        full_conversation: coreMessages,
                    });
                    dbError = error;
                } else if (runtimeIntent === 'maid_registration') {
                    const { error } = await supabase.from('helper_registrations').insert({
                        name: runtimeName,
                        phone: runtimePhone,
                        conversation_id: conversationId,
                        full_conversation: coreMessages,
                    });
                    dbError = error;
                } else {
                    const { error } = await supabase.from('general_enquiries').insert({
                        conversation_id: conversationId,
                        question: runtimeDecision.shouldEscalate ? `[ESCALATED] ${latestMessage}` : latestMessage,
                        bot_answer: runtimeDisplayText,
                    });
                    dbError = error;
                }

                if (dbError) {
                    console.error(`DB INSERT FAILED (${runtimeIntent}):`, dbError);
                }
            } catch (escalationError) {
                console.error('Escalation failed:', escalationError);
            }
        } else if (runtimeIntent === 'general') {
            try {
                await supabase.from('general_enquiries').insert({
                    conversation_id: conversationId,
                    question: latestMessage,
                    bot_answer: runtimeDisplayText,
                });
            } catch {
                console.warn('Failed to log general enquiry');
            }
        }

        const runtimeTextId = crypto.randomUUID();
        const runtimeUiStream = createUIMessageStream({
            execute: ({ writer }) => {
                writer.write({ type: 'text-start', id: runtimeTextId });
                writer.write({ type: 'text-delta', delta: runtimeDisplayText, id: runtimeTextId });
                writer.write({ type: 'metadata', data: { handledIntent: runtimeIntent, newState: runtimeDecision.sessionSnapshot.currentState }, id: runtimeTextId });
                writer.write({ type: 'text-end', id: runtimeTextId });
            },
        });

        return createUIMessageStreamResponse({ stream: runtimeUiStream });

    } catch (error: any) {
        console.error('API Error:', error);

        if (error?.message?.includes('429') || error?.status === 429) {
            return new Response(JSON.stringify({
                error: 'Rate Limit Exceeded',
                waitMs: 60000,
            }), { status: 429 });
        }

        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}

