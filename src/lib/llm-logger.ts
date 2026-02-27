// src/lib/llm-logger.ts
import { createClient } from '@supabase/supabase-js';
import type { ExtractionMeta } from '../extractors/llmExtractor';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logLLMInteraction(data: {
    conversationId: string;
    intent: string;
    systemPrompt: string;
    userMessage: string;
    fullHistory: any[];
    rawResponse: string;
    cleanedResponse: string;
    tookMs: number;
    extractionMeta?: ExtractionMeta;
}) {
    try {
        await supabase.from('llm_logs').insert({
            conversation_id: data.conversationId,
            intent: data.intent,
            system_prompt: data.systemPrompt,
            user_message: data.userMessage,
            full_message_history: data.fullHistory,
            raw_llm_response: data.rawResponse,
            after_guardrails: data.cleanedResponse,
            took_ms: data.tookMs,
            extraction_meta: data.extractionMeta ?? null,
        });

        console.log('✅ LLM interaction logged to Supabase');
    } catch (error) {
        console.error('❌ Failed to log LLM interaction:', error);
    }
}

export function logToConsole(data: {
    intent: string;
    systemPrompt: string;
    userMessage: string;
    rawResponse: string;
    cleanedResponse: string;
}) {
    console.log('\n' + '='.repeat(80));
    console.log('🧠 LLM INTERACTION LOG');
    console.log('='.repeat(80));
    console.log('📍 Intent:', data.intent);
    console.log('\n📥 SYSTEM PROMPT:');
    console.log(data.systemPrompt.substring(0, 200) + '...');
    console.log('\n💬 USER MESSAGE:');
    console.log(data.userMessage);
    console.log('\n🤖 RAW LLM RESPONSE:');
    console.log(data.rawResponse);
    console.log('\n✅ AFTER GUARDRAILS:');
    console.log(data.cleanedResponse);
    console.log('='.repeat(80) + '\n');
}
