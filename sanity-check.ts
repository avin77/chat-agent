
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';
import { SYSTEM_PROMPT } from './src/core/ai/prompts';

// Load Env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/)?.[1]?.trim() || '';
} catch (e) { }

async function sanityCheck() {
    console.log('--- Sanity Check: Happy Path ---');
    const model = google('gemma-3-1b-it');
    const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: [
            { role: 'user', content: 'I need a maid.' },
            { role: 'assistant', content: 'Sure. Name and Phone?' },
            { role: 'user', content: 'Ravi 9988776655' }
        ]
    });
    console.log('Bot Response:', result.text);
    if (result.text.includes('[ESCALATE]')) {
        console.log('✅ PASS: Escalation Tag Present');
    } else {
        console.log('❌ FAIL: Tag Missing');
    }
}

sanityCheck();
