
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';

// Manually load env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    const lines = envFile.split('\n');
    for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            process.env[key] = value;
        }
    }
} catch (e) {
    console.error('Error loading .env.local:', e);
}

async function testGemma() {
    try {
        console.log('Testing gemma-3-1b-it...');
        const result = await generateText({
            model: google('gemma-3-1b-it'),
            prompt: 'Hello! Are you working? Reply with "Yes".',
        });
        console.log('✅ Success:', result.text);
    } catch (error: any) {
        console.error('❌ Error with gemma-3-1b-it:', error.message);
    }
}

testGemma();
