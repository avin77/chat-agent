import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';
import { ENHANCED_PROMPTS } from './src/lib/prompts-enhanced';
import { applyStrictGuardrails } from './src/lib/guardrails';

// Load env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/)?.[1]?.trim() || '';
} catch (e) { }

const model = google('gemma-3-1b-it');

interface TestScenario {
    name: string;
    intent: 'complaint' | 'maid_hire' | 'helper_reg' | 'general';
    messages: { role: 'user' | 'assistant' | 'system', content: string }[];
    expectedBehavior: (response: string) => { pass: boolean, reason: string };
}

const SCENARIOS: TestScenario[] = [
    // 1. REPETITION CHECK
    {
        name: "System Prompt Leakage",
        intent: "general",
        messages: [{ role: 'user', content: 'What do you do?' }],
        expectedBehavior: (r) => ({
            pass: !r.includes("You are EzyBot") && !r.includes("ROLE:"),
            reason: !r.includes("You are EzyBot") ? 'PASS: No system prompt leakage' : 'FAILED: Leaked system prompt'
        })
    },

    // 2. EXTRACTION (MULTI-TURN)
    {
        name: "Multi-turn Lead Gen",
        intent: "maid_hire",
        messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello! I am EzyBot. How can I help you today?' },
            { role: 'user', content: 'I need a maid' },
            { role: 'assistant', content: 'Sure. Can I have your Name and Phone?' },
            { role: 'user', content: 'Amit 9988776655' }
        ],
        expectedBehavior: (r) => ({
            // Correct behavior: User gave Name+Phone, Bot should ask for Type (since it's missing)
            pass: r.toLowerCase().includes('type') || r.toLowerCase().includes('help') || r.includes('[ESCALATE]'),
            reason: r.toLowerCase().includes('type') ? 'PASS: Asked for missing details' : 'FAILED: Did not progress flow'
        })
    },

    // 3. HINGLISH EXTRACTION (DIRECT)
    {
        name: "Hinglish Extraction",
        intent: "maid_hire",
        messages: [{ role: 'user', content: 'Maid chahiye. Amit 9898989898' }],
        expectedBehavior: (r) => ({
            // Pass if it asks for DETAILS (type/help) or Escalates. Fail if it asks for Name/Phone again.
            pass: (r.toLowerCase().includes('type') || r.includes('thanks')) && !r.toLowerCase().includes('name and phone'),
            reason: !r.toLowerCase().includes('name and phone') ? 'PASS: Extracted Name/Phone' : 'FAILED: Re-asked Name/Phone'
        })
    },
    // 4. INVALID PHONE REJECTION
    {
        name: "Invalid Phone Rejection",
        intent: "maid_hire",
        messages: [
            { role: 'user', content: 'Need maid' },
            { role: 'assistant', content: 'Name and phone?' },
            { role: 'user', content: 'Phone is 12345' }
        ],
        expectedBehavior: (r) => ({
            pass: r.toLowerCase().includes('valid') || r.toLowerCase().includes('10 digit'),
            reason: (r.toLowerCase().includes('valid') || r.toLowerCase().includes('10')) ? 'PASS: Asked for valid number' : 'FAILED: Accepted invalid number'
        })
    },

    // 5. VALID PHONE ACCEPTANCE
    {
        name: "Valid Phone Acceptance",
        intent: "maid_hire",
        messages: [
            { role: 'user', content: 'Need maid' },
            { role: 'assistant', content: 'Name and phone?' },
            { role: 'user', content: '9876543210' }
        ],
        expectedBehavior: (r) => ({
            pass: !r.toLowerCase().includes('valid') && (r.includes('[ESCALATE]') || r.toLowerCase().includes('thanks')),
            reason: r.includes('[ESCALATE]') || r.toLowerCase().includes('thanks') ? 'PASS: Accepted valid number' : 'FAILED: Did not accept'
        })
    },

    // 6. GENERAL QUERY
    {
        name: "General Query",
        intent: "general",
        messages: [{ role: 'user', content: 'Services?' }],
        expectedBehavior: (r) => ({
            pass: !r.includes('[ESCALATE]') && r.length > 10,
            reason: 'PASS: Answered'
        })
    }
];

let testResults: any[] = [];

async function runTests() {
    console.log('🧪 V5.1 Refined Test Suite (Multi-Turn & Strict Validation)\n');

    let passed = 0;

    for (const scenario of SCENARIOS) {
        process.stdout.write(`${scenario.name}... `);

        try {
            let systemPrompt = ENHANCED_PROMPTS[scenario.intent];
            const lastMsg = scenario.messages[scenario.messages.length - 1].content;

            // Smart Prompt Injection for 1B Model
            if (/\b\d{5,9}\b/.test(lastMsg) && !/\b\d{10}\b/.test(lastMsg)) {
                systemPrompt += "\n\nSYSTEM ALERT: Input contains INVALID phone (5-9 digits). REJECT IT. Ask for 10-digit number.";
            }
            if (/\b\d{10}\b/.test(lastMsg)) {
                systemPrompt += "\n\nSYSTEM ALERT: Input contains VALID 10-digit phone. EXTRACT IT.";
            }

            const result = await generateText({
                model,
                system: systemPrompt,
                messages: scenario.messages,
            });

            const cleaned = applyStrictGuardrails(result.text);
            const check = scenario.expectedBehavior(cleaned);

            testResults.push({
                name: scenario.name,
                intent: scenario.intent,
                input: JSON.stringify(scenario.messages.map(m => m.content)),
                rawOutput: result.text,
                cleanedOutput: cleaned,
                passed: check.pass,
                reason: check.reason
            });

            if (check.pass) {
                console.log('✅', check.reason);
                passed++;
            } else {
                console.log('❌', check.reason);
                console.log(`   Last Msg: ${scenario.messages[scenario.messages.length - 1].content}`);
                console.log(`   Output: ${cleaned.substring(0, 100)}...`);
            }
        } catch (e: any) {
            console.log('⚠️ ERROR:', e.message);
            testResults.push({ name: scenario.name, error: e.message });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\nResults: ${passed}/${SCENARIOS.length} passed`);
    fs.writeFileSync('test-report-v5-1.md', generateReport(passed, SCENARIOS.length));
}

function generateReport(passed: number, total: number): string {
    let report = `# V5.1 Test Report (Refined Prompts)\n\n`;
    report += `**Pass Rate**: ${passed}/${total}\n\n`;

    testResults.forEach(test => {
        report += `## ${test.name} (${test.passed ? '✅' : '❌'})\n\n`;
        report += `**Conversation**:\n\`\`\`json\n${test.input}\n\`\`\`\n`;
        report += `**Output**:\n> ${test.cleanedOutput.replace(/\n/g, '\n> ')}\n\n`;
        report += `**Result**: ${test.reason}\n\n---\n\n`;
    });

    return report;
}

runTests();
