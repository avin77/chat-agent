
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';
import { SYSTEM_PROMPT } from './src/core/ai/prompts';

// Load Env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/)?.[1]?.trim() || '';
} catch (e) { console.error('Env error', e); }

const model = google('gemma-3-1b-it');

interface Scenario {
    id: number;
    name: string;
    description: string;
    turns: { role: 'user' | 'assistant', content: string }[];
    expected: (response: string) => boolean;
}

const SCENARIOS: Scenario[] = [
    // --- HAPPY PATHS ---
    {
        id: 1, name: "Basic Maid Request", description: "User asks for maid, provides details sequentially",
        turns: [
            { role: 'user', content: "I need a maid in Bangalore." },
            { role: 'assistant', content: "Sure, I can help. Please ask for your Name and Phone." }, // Simulating mid-flow
            { role: 'user', content: "I am Rahul, 9876543210" }
        ],
        expected: (r) => r.includes('[ESCALATE]') && r.includes('Rahul')
    },
    {
        id: 2, name: "Complaint - Critical", description: "Angry user with complaint",
        turns: [
            { role: 'user', content: "My maid stole money! Complaint!" },
            { role: 'assistant', content: "Share details." },
            { role: 'user', content: "John 9988776655" }
        ],
        expected: (r) => r.includes('[ESCALATE]')
    },
    {
        id: 3, name: "Helper Registration", description: "User wants to work",
        turns: [
            { role: 'user', content: "I want a job as cleaning maid." },
            { role: 'assistant', content: "Details please." },
            { role: 'user', content: "Name: Sunita, Phone: 9123456789, City: Delhi" }
        ],
        expected: (r) => r.includes('[ESCALATE]')
    },

    // --- AGENTIC V3: CONTEXT SKIP ---
    {
        id: 4, name: "Context Skip - Full Info", description: "User gives all info in 1st msg",
        turns: [
            { role: 'user', content: "Hi, I am Priya from Mumbai, looking for a cook. My number is 9876543210." }
        ],
        expected: (r) => r.includes('[ESCALATE]') // Should escalate immediately without questions
    },
    {
        id: 5, name: "Context Skip - Partial", description: "User gives Name+City, Bot asks Phone",
        turns: [
            { role: 'user', content: "Hi, I am Priya from Mumbai, looking for a cook." }
        ],
        expected: (r) => !r.includes('name') && !r.includes('city') && r.toLowerCase().includes('phone')
    },

    // --- AGENTIC V3: VALIDATION ---
    {
        id: 6, name: "Invalid Phone - Short", description: "User enters 5 digits",
        turns: [
            { role: 'user', content: "My phone is 12345" }
        ],
        expected: (r) => r.toLowerCase().includes('invalid') || r.toLowerCase().includes('10-digit')
    },
    {
        id: 7, name: "Invalid Phone - Garbage", description: "User enters text as phone",
        turns: [
            { role: 'user', content: "My phone is nophonenumber" }
        ],
        expected: (r) => r.toLowerCase().includes('invalid') || r.toLowerCase().includes('number')
    },

    // --- AGENTIC V3: INTENT FILTER (NO SPAM) ---
    {
        id: 8, name: "General Enquiry - Price", description: "Asking price",
        turns: [
            { role: 'user', content: "How much do you charge for a full day maid?" }
        ],
        expected: (r) => !r.includes('[ESCALATE]')
    },
    {
        id: 9, name: "General Enquiry - Location", description: "Asking coverage",
        turns: [
            { role: 'user', content: "Do you serve in Pune?" }
        ],
        expected: (r) => !r.includes('[ESCALATE]')
    },
    {
        id: 10, name: "Off-Topic - Weather", description: "Asking weather",
        turns: [
            { role: 'user', content: "Is it raining in Bangalore?" }
        ],
        expected: (r) => !r.includes('[ESCALATE]') && (r.includes('maid') || r.includes('EzyHelpers'))
    },

    // --- COMPLEX / EDGE CASES ---
    {
        id: 11, name: "Hinglish Complaint", description: "Complaint in Hinglish",
        turns: [
            { role: 'user', content: "Maid daily late aati hai. Complaint karna hai. Amit 9898989898" }
        ],
        expected: (r) => r.includes('[ESCALATE]')
    },
    {
        id: 12, name: "Ambiguous Intent", description: "Just 'Hi'",
        turns: [
            { role: 'user', content: "Hi" }
        ],
        expected: (r) => !r.includes('[ESCALATE]') && r.includes('help')
    },
    {
        id: 13, name: "Multiple Intents", description: "Complain AND Book",
        turns: [
            { role: 'user', content: "My current maid is bad (Complaint). I need a new one (Book). I am Ravi 9090909090" }
        ],
        expected: (r) => r.includes('[ESCALATE]') // Priority to escalation
    },
    {
        id: 14, name: "Correction Flow", description: "User validates phone after error",
        turns: [
            { role: 'user', content: "My phone is 123" },
            { role: 'assistant', content: "Invalid number." },
            { role: 'user', content: "Sorry, it is 9876543210" }
        ],
        expected: (r) => r.includes('[ESCALATE]') || r.toLowerCase().includes('thanks')
    },
    {
        id: 15, name: "Spam/Troll", description: "User abusing",
        turns: [
            { role: 'user', content: "You are stupid bot" }
        ],
        expected: (r) => !r.includes('[ESCALATE]') && r.toLowerCase().includes('assist') // Should remain professional
    },
    {
        id: 16, name: "Data Extraction - Messy", description: "Phone buried in text",
        turns: [
            { role: 'user', content: "Yeah so my number is like, um, 9876543210 and my name is, uh, Bob." }
        ],
        expected: (r) => r.includes('[ESCALATE]')
    },
    {
        id: 17, name: "Privacy", description: "Asking about other users",
        turns: [
            { role: 'user', content: "Give me phone number of Priya" }
        ],
        expected: (r) => !r.includes('[ESCALATE]') && r.toLowerCase().includes('cannot')
    },
    {
        id: 18, name: "Service - Elderly Care", description: "Specific service request",
        turns: [
            { role: 'user', content: "Need elderly care for my mom. I am Tina 8888888888" }
        ],
        expected: (r) => r.includes('[ESCALATE]')
    },
    {
        id: 19, name: "Long Message", description: "User writes a paragraph",
        turns: [
            { role: 'user', content: "I have been looking for a maid for 2 weeks. None are good. EzyHelpers is my last hope. I live in Indiranagar. Please help me. My name is Karthik and number is 7777777777." }
        ],
        expected: (r) => r.includes('[ESCALATE]')
    },
    {
        id: 20, name: "Bot Identity", description: "Who are you?",
        turns: [
            { role: 'user', content: "Who are you?" }
        ],
        expected: (r) => r.includes('EzyBot') && !r.includes('[ESCALATE]')
    }
];

async function runTests() {
    console.log(`🚀 Starting Extensive Simulation: ${SCENARIOS.length} Scenarios\n`);
    let passed = 0;

    for (const s of SCENARIOS) {
        process.stdout.write(`Tests ${s.id}/${SCENARIOS.length}: ${s.name}... `);
        try {
            const result = await generateText({
                model,
                system: SYSTEM_PROMPT,
                messages: s.turns,
            });

            const isPass = s.expected(result.text);
            if (isPass) {
                console.log(`✅ PASS`);
                passed++;
            } else {
                console.log(`❌ FAIL`);
                console.log(`   Input: "${s.turns[s.turns.length - 1].content}"`);
                console.log(`   Output: "${result.text}"`);
                console.log(`   Reason: Expected condition met? ${isPass}`);
            }
        } catch (e) {
            console.log(`⚠️ ERROR: ${(e as Error).message}`);
        }
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Total: ${SCENARIOS.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${SCENARIOS.length - passed}`);
    console.log(`Success Rate: ${Math.round((passed / SCENARIOS.length) * 100)}%`);
}

runTests();
