import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';

// Load API Key
const envFile = fs.readFileSync('.env.local', 'utf-8');
const apiKeyMatch = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

if (!apiKey) {
    console.error('❌ API Key not found in .env.local');
    process.exit(1);
}

process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;

console.log(`🔑 Testing with API Key: ${apiKey.substring(0, 8)}...`);
console.log(`📡 Attempting to generate text with gemini-2.0-flash-001...\n`);

async function testAPI() {
    try {
        const result = await generateText({
            model: google('gemini-2.0-flash-001'),
            prompt: 'Say "Hello" in one word.',
            maxRetries: 0,
        });

        console.log('✅ SUCCESS!');
        console.log('Response:', result.text);
        console.log('Usage:', result.usage);
        return true;
    } catch (error: any) {
        console.error('❌ FAILED');
        console.error('Error Name:', error?.name);
        console.error('Error Message:', error?.message);
        console.error('Status Code:', error?.statusCode);

        if (error?.message?.includes('429') || error?.statusCode === 429) {
            console.log('\n⏱️ RATE LIMIT DETECTED');
            console.log('This confirms your API key has exhausted its quota.');
            console.log('You need to either:');
            console.log('  1. Wait for quota reset (check Google AI Studio)');
            console.log('  2. Upgrade to a paid plan');
            console.log('  3. Use a different API key');
        }
        return false;
    }
}

testAPI();
