import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const apiKeyMatch = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

if (!apiKey) {
    console.error('❌ API Key not found');
    process.exit(1);
}

process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;

console.log(`🧪 Testing gemini-2.5-flash-lite...\n`);

async function testFlashLite() {
    try {
        const result = await generateText({
            model: google('gemini-2.5-flash-lite'),
            prompt: 'Say "Hello" in one word.',
            maxRetries: 0,
        });

        console.log('✅ SUCCESS! gemini-2.5-flash-lite is working!');
        console.log('Response:', result.text);
        console.log('Usage:', result.usage);
        console.log('\n✨ This model has 15 requests/min and 1,000 requests/day on free tier.');
        return true;
    } catch (error: any) {
        console.error('❌ FAILED');
        console.error('Error:', error?.message);
        console.error('Status:', error?.statusCode);
        return false;
    }
}

testFlashLite();
