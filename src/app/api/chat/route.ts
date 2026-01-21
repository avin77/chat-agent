import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import * as fs from 'fs';
import { ENHANCED_PROMPTS } from '@/lib/prompts-enhanced';
import { applyStrictGuardrails, validatePhone, extractName } from '@/lib/guardrails';
import { logLLMInteraction, logToConsole } from '@/lib/llm-logger';
import { sendEmail } from '@/lib/email';
import { geminiRateLimiter } from '@/lib/rateLimiter';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 30;
export const runtime = 'nodejs';

// Trim messages to fit token limit (gemma-3-1b-it = 8192 tokens)
function trimMessages(messages: any[]): any[] {
    if (messages.length <= 12) return messages;

    return [
        ...messages.slice(0, 2),
        { role: 'system', content: '[... earlier conversation ...]' },
        ...messages.slice(-10)
    ];
}

function detectIntent(message: string): 'complaint' | 'maid_hire' | 'helper_reg' | 'general' {
    const lower = message.toLowerCase();

    // Negative patterns
    if (/don't|do not|doesn't|never|stop|my friend|my neighbor/.test(lower)) {
        return 'general';
    }

    // Positive patterns
    if (/complaint|issue|problem|angry|upset|bad service/.test(lower)) return 'complaint';
    if (/need.*maid|hire.*maid|looking for.*maid|want.*maid/.test(lower)) return 'maid_hire';
    if (/need.*job|want.*work|looking for.*job|i am.*maid|i am.*helper/.test(lower)) return 'helper_reg';
    return 'general';
}

// Session management: Detect intent ONCE per conversation
async function getOrCreateSession(conversationId: string, latestMessage: string) {
    try {
        const { data: existingSession, error } = await supabase
            .from('conversation_sessions')
            .select('*')
            .eq('conversation_id', conversationId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is 'not found'
            try { fs.appendFileSync('chat_debug.log', `[DB Select Error] ${JSON.stringify(error)}\n`); } catch (e) { }
        }

        if (existingSession && !error) {
            // Check if user is switching context
            const newIntent = detectIntent(latestMessage);
            const currentIntent = existingSession.detected_intent;

            // If new intent is detected AND it's different AND it's not 'general' (unless we want to allow resetting)
            // Ideally, specific intents > general.
            if (newIntent !== 'general' && newIntent !== currentIntent) {
                console.log(`[Session] Switching intent from ${currentIntent} to ${newIntent}`);
                await supabase
                    .from('conversation_sessions')
                    .update({
                        detected_intent: newIntent,
                        last_activity: new Date().toISOString()
                    })
                    .eq('conversation_id', conversationId);
                return newIntent;
            }

            await supabase
                .from('conversation_sessions')
                .update({ last_activity: new Date().toISOString() })
                .eq('conversation_id', conversationId);

            return existingSession.detected_intent as 'complaint' | 'maid_hire' | 'helper_reg' | 'general';
        }

        const intent = detectIntent(latestMessage);
        const { error: insertError } = await supabase
            .from('conversation_sessions')
            .insert({
                conversation_id: conversationId,
                detected_intent: intent,
            });

        if (insertError) {
            try { fs.appendFileSync('chat_debug.log', `[DB Insert Error] ${JSON.stringify(insertError)}\n`); } catch (e) { }
        }

        return intent;
    } catch (err) {
        try { fs.appendFileSync('chat_debug.log', `[Session Error] ${JSON.stringify(err)}\n`); } catch (e) { }
        return detectIntent(latestMessage);
    }
}

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

        const latestMessage = messages[messages.length - 1].content;
        const conversationId = req.headers.get('x-conversation-id') || id || crypto.randomUUID();

        try {
            fs.appendFileSync('chat_debug.log', `DEBUG_SESSION: ResolvedID: ${conversationId} BodyID: ${id} HeaderID: ${req.headers.get('x-conversation-id')}\n`);
        } catch (e) { }

        // Get intent from session
        const intent = await getOrCreateSession(conversationId, latestMessage);
        let systemPrompt = ENHANCED_PROMPTS[intent] || ENHANCED_PROMPTS.general;

        // Smart Prompt Injection for reliability
        if (/\b\d{5,9}\b/.test(latestMessage) && !/\b\d{10}\b/.test(latestMessage)) {
            systemPrompt += "\n\nSYSTEM ALERT: Input contains INVALID phone (5-9 digits). REJECT IT. Ask for 10-digit number.";
        }
        if (/\b\d{10}\b/.test(latestMessage)) {
            systemPrompt += "\n\nSYSTEM ALERT: Input contains VALID 10-digit phone. EXTRACT IT.";
        }

        // Sanitize and trim messages
        const coreMessages = messages.map((m: any) => ({
            role: m.role,
            content: m.content || '.',
        }));

        const trimmedMessages = trimMessages(coreMessages);

        const startTime = Date.now();

        // Wrap streamText in try-catch logic
        try {
            const result = streamText({
                model: google('gemma-3-1b-it'),
                system: systemPrompt,
                messages: trimmedMessages,
                onError: async (error: any) => {
                    console.error("🔥 GEMINI STREAM ERROR:", error);
                    if (error.message?.includes('429') || error.status === 429) {
                        // Log System Error
                        await logLLMInteraction({
                            conversationId, intent: 'SYSTEM_ERROR',
                            systemPrompt: 'Resource Exhausted', userMessage: latestMessage,
                            fullHistory: [], rawResponse: '429 Rate Limit',
                            cleanedResponse: 'System is busy. Please try again later.', tookMs: 0
                        });
                    }
                },
                onFinish: async ({ text }) => {
                    const tookMs = Date.now() - startTime;

                    // SAFETY NET: Catch truncated/empty responses
                    let finalText = text;
                    // stricter check: if text is empty, < 4 chars (unless specific words), or just punctuation
                    if (!text || text.trim().length < 4 || /^[\.\,\!\?\s]+$/.test(text) || text.trim() === 'failed') {
                        console.warn('[SAFETY NET] Detected truncated response:', text);

                        // Context-aware fallback
                        const phone = validatePhone(latestMessage);
                        const name = extractName(latestMessage);


                        // Check for SHORT phone (5-9 digits) which is invalid
                        const hasShortPhone = /\b\d{5,9}\b/.test(latestMessage);

                        // DELAY SIMULATION: If specific invalid pattern, wait 2s to mimic "Checking..."
                        if (intent !== 'general' && (hasShortPhone || (!phone && /^\d+$/.test(latestMessage)))) {
                            console.log('[Delay] simulating human check for invalid number...');
                            await new Promise(r => setTimeout(r, 2000));
                        }

                        if (intent === 'maid_hire' || intent === 'complaint' || intent === 'helper_reg') {
                            if (phone && !name) {
                                finalText = "Thank you for the number. What is your Name?";
                            } else if (name && hasShortPhone && !phone) {
                                // Name provided but phone is invalid (too short)
                                finalText = "I got your name, but the phone number looks invalid. Please provide a 10-digit mobile number.";
                            } else if (name && !phone) {
                                finalText = "Thanks! Could you please share your 10-digit Phone Number?";
                            } else if (!phone && !name) {
                                finalText = "Could you please provide your Name and Phone Number so I can help you?";
                            } else {
                                finalText = "I'm processing your request. Could you please confirm your details?";
                            }
                        } else {
                            finalText = "I didn't quite catch that. Could you please rephrase?";
                        }

                        try {
                            fs.appendFileSync('chat_debug.log', `[SAFETY NET TRIGGERED] Original: "${text}" -> Replaced: "${finalText}"\n`);
                        } catch (e) { }
                    }

                    const cleaned = applyStrictGuardrails(finalText);

                    // Debug log
                    try {
                        fs.appendFileSync('chat_debug.log', `[Finish] ${JSON.stringify({ text: cleaned, intent }, null, 2)}\n---\n`);
                    } catch (e) { }

                    // Console log (dev)
                    if (process.env.NODE_ENV === 'development') {
                        logToConsole({
                            intent,
                            systemPrompt,
                            userMessage: latestMessage,
                            rawResponse: text,
                            cleanedResponse: cleaned
                        });
                    }

                    // Log to Supabase
                    try {
                        await logLLMInteraction({
                            conversationId,
                            intent,
                            systemPrompt,
                            userMessage: latestMessage,
                            fullHistory: trimmedMessages,
                            rawResponse: text,
                            cleanedResponse: cleaned,
                            tookMs
                        });
                    } catch (logError) {
                        console.error('Logging failed:', logError);
                    }

                    // Extract data
                    const phone = validatePhone(latestMessage);
                    const name = extractName(latestMessage);

                    // Handle escalation
                    // Detect [ESCALATE] or just ESCALATE (case insensitive)
                    if (/\[?ESCALATE\]?/i.test(text)) {
                        try {
                            // Handle escalation
                            console.log(`[ESCALATE] Attempting DB Insert for Intent: ${intent}`);
                            let dbError = null;

                            if (intent === 'complaint') {
                                const { error } = await supabase.from('complaints').insert({
                                    name, phone,
                                    issue_description: latestMessage,
                                    conversation_id: conversationId,
                                    full_conversation: coreMessages
                                });
                                dbError = error;
                            } else if (intent === 'maid_hire') {
                                const { error } = await supabase.from('leads').insert({
                                    name, phone,
                                    conversation_id: conversationId,
                                    full_conversation: coreMessages
                                });
                                dbError = error;
                            } else if (intent === 'helper_reg') {
                                const { error } = await supabase.from('helper_registrations').insert({
                                    name, phone,
                                    conversation_id: conversationId,
                                    full_conversation: coreMessages
                                });
                                dbError = error;
                            } else {
                                // CS: Fallback escalation for 'general'
                                const { error } = await supabase.from('general_enquiries').insert({
                                    conversation_id: conversationId,
                                    question: `[ESCALATED] ${latestMessage}`,
                                    bot_answer: "Escalated to admin."
                                });
                                dbError = error;
                            }

                            if (dbError) {
                                console.error(`❌ DB INSERT FAILED (${intent}):`, dbError);
                                try { fs.appendFileSync('chat_debug.log', `[DB ERROR] ${JSON.stringify(dbError)}\n`); } catch (e) { }
                            } else {
                                console.log(`✅ DB Insert Success for ${intent}`);
                            }

                            // Send email
                            await sendEmail({
                                to: process.env.ADMIN_EMAIL!,
                                subject: `🚨 ${intent.toUpperCase()} ESCALATION: ${name || 'Unknown'}`,
                                html: `
                <h2>New ${intent.replace('_', ' ').toUpperCase()} Lead</h2>
                <p><strong>Name:</strong> ${name || 'Not provided'}</p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                <p><strong>Conversation ID:</strong> ${conversationId}</p>
                <p><strong>Intent:</strong> ${intent}</p>
                <hr>
                <h3>Full Conversation:</h3>
                <pre>${JSON.stringify(coreMessages, null, 2)}</pre>
              `
                            });

                            console.log('✅ Escalation processed:', intent, name, phone);
                            try { fs.appendFileSync('chat_debug.log', `[ESCALATION SUCCESS] Intent: ${intent}, Name: ${name}, Phone: ${phone}\n`); } catch (e) { }
                        } catch (escalationError) {
                            console.error('Escalation failed:', escalationError);
                            try { fs.appendFileSync('chat_debug.log', `[ESCALATION FAILED] ${escalationError}\n`); } catch (e) { }
                        }
                    } else if (intent === 'general') {
                        try {
                            await supabase.from('general_enquiries').insert({
                                conversation_id: conversationId,
                                question: latestMessage,
                                bot_answer: cleaned
                            });
                        } catch {
                            console.warn('Failed to log general enquiry');
                        }
                    }
                },
            },
            });

        return result.toUIMessageStreamResponse();
    } catch (streamError: any) {
        console.error("🔥 GEMINI EXECUTION ERROR:", streamError);
        if (streamError.message?.includes('429')) {
            return new Response("System Busy (Rate Limit)", { status: 429 });
        }
        throw streamError;
    }
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
