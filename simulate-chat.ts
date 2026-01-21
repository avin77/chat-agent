
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';
import { SYSTEM_PROMPT } from './src/core/ai/prompts';

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
    console.error('Error loading .env.local', e);
}

const model = google('gemma-3-1b-it');

async function runScenario(name: string, history: any[]) {
    console.log(`\n--- SCENARIO: ${name} ---`);
    console.log(`User Input: ${history[history.length - 1].content}`);

    const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: history,
    });

    console.log(`🤖 Bot (${name}): ${result.text}`);
    return result.text;
}

async function simulate() {
    // SCENARIO 1: Context Awareness (Skip Name/Service questions)
    // User provides Name + Service in first message.
    // Bot should ONLY ask for Phone/City.
    const s1 = await runScenario('Context Skip', [
        { role: 'user', content: 'Hi, I am John looking for a cook service.' }
    ]);
    if (!s1.toLowerCase().includes('name') && !s1.toLowerCase().includes('cooking')) {
        console.log('✅ PASS: Bot skipped Name/Service questions.');
    } else {
        console.log('❌ FAIL: Bot re-asked known info (Name or Service).');
    }

    // SCENARIO 2: Validation (Invalid Phone)
    const s2 = await runScenario('Validation', [
        { role: 'user', content: 'I need a maid.' },
        { role: 'assistant', content: 'Sure, share your Name and Phone.' },
        { role: 'user', content: 'My phone is 12345' }
    ]);
    if (s2.toLowerCase().includes('invalid') || s2.toLowerCase().includes('10-digit')) {
        console.log('✅ PASS: Bot detected invalid phone.');
    } else {
        console.log('❌ FAIL: Bot accepted invalid phone.');
    }

    // SCENARIO 3: Smart Escalation (General Enquiry -> No Escalate)
    const s3 = await runScenario('General Enquiry', [
        { role: 'user', content: 'What are your prices for 24hr maid?' }
    ]);
    if (!s3.includes('[ESCALATE]')) {
        console.log('✅ PASS: Bot did NOT escalate general enquiry.');
    } else {
        console.log('❌ FAIL: Bot escalated a general question.');
    }

    // SCENARIO 4: Complaint Escalation
    const s4 = await runScenario('Complaint', [
        { role: 'user', content: 'I have a big fail complaint.' },
        { role: 'assistant', content: 'Please share your Name and Phone.' },
        { role: 'user', content: 'UserA 9988776655' }
    ]);
    if (s4.includes('[ESCALATE]')) {
        console.log('✅ PASS: Bot escalated valid complaint.');
    } else {
        console.log('❌ FAIL: Bot failed to escalate complaint.');
    }
}

simulate();
