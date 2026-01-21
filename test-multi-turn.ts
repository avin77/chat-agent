// Test Multi-Turn Conversations (Simulating Real API Calls)
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import * as fs from 'fs';
import { ENHANCED_PROMPTS } from './src/lib/prompts-enhanced';
import { applyStrictGuardrails, validatePhone, extractName } from './src/lib/guardrails';

// Load Env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/)?.[1]?.trim() || '';
} catch (e) {
    console.error('Env error', e);
}

const model = google('gemma-3-1b-it');

interface TestScenario {
    name: string;
    intent: 'complaint' | 'maid_hire' | 'helper_reg' | 'general';
    conversation: Array<{ role: 'user' | 'assistant', content: string }>;
    expectedPattern: RegExp | string;
}

const MULTI_TURN_SCENARIOS: TestScenario[] = [
    {
        name: "Complaint with Invalid Phone then Name Only",
        intent: 'complaint',
        conversation: [
            { role: 'user', content: 'I have a complaint to report.' },
            { role: 'assistant', content: 'Please share your Name and Phone Number (10 digits).' },
            { role: 'user', content: 'bj 9879899' }, // Invalid phone (7 digits)
        ],
        expectedPattern: /invalid|10-digit/i
    },
    {
        name: "Complaint with Valid Phone Only",
        intent: 'complaint',
        conversation: [
            { role: 'user', content: 'I have a complaint about my maid.' },
            { role: 'assistant', content: 'Please share your Name and Phone Number (10 digits).' },
            { role: 'user', content: '9911223344' }, // Valid phone, no name
        ],
        expectedPattern: /name/i
    },
    {
        name: "Hiring with Name Only",
        intent: 'maid_hire',
        conversation: [
            { role: 'user', content: 'I want to hire a maid.' },
            { role: 'assistant', content: 'Please provide your Name and Phone number.' },
            { role: 'user', content: 'My name is John' },
        ],
        expectedPattern: /phone/i
    },
    {
        name: "Context Switch (Hiring to Complaint)",
        intent: 'maid_hire',
        conversation: [
            { role: 'user', content: 'I want to hire a maid.' },
            { role: 'assistant', content: 'Great! Please share your details.' },
            { role: 'user', content: 'Actually I have a complaint' },
        ],
        expectedPattern: /complaint|name|phone/i
    },
    {
        name: "Full Info Provided",
        intent: 'maid_hire',
        conversation: [
            { role: 'user', content: 'I want to hire a maid.' },
            { role: 'assistant', content: 'Please provide your details.' },
            { role: 'user', content: 'My name is Sarah and my phone is 9988776655' },
        ],
        expectedPattern: /escalate|thank|profile/i
    },
];

async function testMultiTurnScenario(scenario: TestScenario) {
    console.log(`\n🔍 Testing: ${scenario.name}`);
    console.log(`Intent: ${scenario.intent}`);

    const systemPrompt = ENHANCED_PROMPTS[scenario.intent];
    const latestMessage = scenario.conversation[scenario.conversation.length - 1].content;

    // Add system alert for phone validation
    let enhancedPrompt = systemPrompt;
    if (/\b\d{5,9}\b/.test(latestMessage) && !/\b\d{10}\b/.test(latestMessage)) {
        enhancedPrompt += "\n\nSYSTEM ALERT: Input contains INVALID phone (5-9 digits). REJECT IT. Ask for 10-digit number.";
    }
    if (/\b\d{10}\b/.test(latestMessage)) {
        enhancedPrompt += "\n\nSYSTEM ALERT: Input contains VALID 10-digit phone. EXTRACT IT.";
    }

    try {
        const result = await streamText({
            model,
            system: enhancedPrompt,
            messages: scenario.conversation,
        });

        let fullText = '';
        for await (const chunk of result.textStream) {
            fullText += chunk;
        }

        // Apply Safety Net (simulating route.ts logic)
        let finalText = fullText;
        if (!fullText || fullText.trim().length <= 2 || /^[\.\,\!\?]+$/.test(fullText.trim())) {
            console.warn('⚠️ SAFETY NET TRIGGERED');

            const phone = validatePhone(latestMessage);
            const name = extractName(latestMessage);

            if (scenario.intent === 'maid_hire' || scenario.intent === 'complaint' || scenario.intent === 'helper_reg') {
                if (phone && !name) {
                    finalText = "Thank you for the number. What is your Name?";
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
        }

        const cleaned = applyStrictGuardrails(finalText);

        console.log(`📤 User: "${latestMessage}"`);
        console.log(`🤖 Bot: "${cleaned}"`);

        // Check if response matches expected pattern
        const isMatch = typeof scenario.expectedPattern === 'string'
            ? cleaned.includes(scenario.expectedPattern)
            : scenario.expectedPattern.test(cleaned);

        // Check for dot bug
        const hasDotBug = cleaned.trim() === '.' || cleaned.trim().length <= 2;

        if (hasDotBug) {
            console.log('❌ FAIL - DOT BUG DETECTED!');
            return false;
        } else if (!isMatch) {
            console.log(`⚠️ WARN - Response doesn't match expected pattern`);
            console.log(`Expected: ${scenario.expectedPattern}`);
            return false;
        } else {
            console.log('✅ PASS');
            return true;
        }
    } catch (error) {
        console.error('❌ ERROR:', error);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Starting Multi-Turn Conversation Tests\n');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;

    for (const scenario of MULTI_TURN_SCENARIOS) {
        const result = await testMultiTurnScenario(scenario);
        if (result) {
            passed++;
        } else {
            failed++;
        }

        // Wait to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 RESULTS:`);
    console.log(`✅ Passed: ${passed}/${MULTI_TURN_SCENARIOS.length}`);
    console.log(`❌ Failed: ${failed}/${MULTI_TURN_SCENARIOS.length}`);
    console.log(`Success Rate: ${Math.round((passed / MULTI_TURN_SCENARIOS.length) * 100)}%`);
}

runAllTests();
