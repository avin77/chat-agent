#!/usr/bin/env node
/**
 * Captures REAL bot responses from the live Vercel chatbot.
 * Sends actual customer messages → gets actual bot replies → saves to CSV for review.
 *
 * This is different from golden-to-csv.js which uses Gemini to IMAGINE responses.
 * This script calls YOUR REAL BOT and records what it actually says.
 *
 * Usage:
 *   node scripts/capture-real-responses.js
 *   node scripts/capture-real-responses.js --url=http://localhost:3000
 *
 * Output: data/real-responses-review.csv
 *
 * Review columns:
 *   Conv ID | Turn | Role | Message | CORRECT? (yes/no) | What should it have said? | Score (1-5)
 */

const fs   = require('fs');
const path = require('path');

const BOT_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
    || 'https://chat-agent-three.vercel.app';

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CSV_PATH  = path.join(DATA_DIR, 'real-responses-review.csv');
const JSONL_PATH = path.join(DATA_DIR, 'real-responses.jsonl');

// ─── Test Conversations ───────────────────────────────────────────────────────
// These are the CUSTOMER messages. The bot will reply with its real response.
const CONVERSATIONS = [

    // MAID HIRE
    {
        id: 'real_hire_01',
        intent: 'maid_hire',
        scenario: 'Step by step hire flow',
        messages: [
            'I need a maid for cooking',
            '9876543210',
            'Koramangala',
            'Cooking',
            'Full-time',
        ]
    },
    {
        id: 'real_hire_02',
        intent: 'maid_hire',
        scenario: 'All info upfront',
        messages: [
            'Need full-time cook in Whitefield. My number is 9123456789',
        ]
    },
    {
        id: 'real_hire_03',
        intent: 'maid_hire',
        scenario: 'Invalid phone then correct',
        messages: [
            'I need a maid',
            '98765',
            '9876543210',
        ]
    },
    {
        id: 'real_hire_04',
        intent: 'maid_hire',
        scenario: 'Asks price first',
        messages: [
            'I want to hire a maid, how much will it cost?',
            '9988776655',
        ]
    },
    {
        id: 'real_hire_05',
        intent: 'maid_hire',
        scenario: 'Hinglish message',
        messages: [
            'mujhe ek maid chahiye cooking ke liye',
        ]
    },
    {
        id: 'real_hire_06',
        intent: 'maid_hire',
        scenario: 'Outside service area',
        messages: [
            'I need a maid in Mumbai',
        ]
    },
    {
        id: 'real_hire_07',
        intent: 'maid_hire',
        scenario: 'Baby care request',
        messages: [
            'Looking for someone to take care of my 6 month old baby',
            '9876543210',
        ]
    },

    // FAQ / GENERAL
    {
        id: 'real_faq_01',
        intent: 'general',
        scenario: '24hr maid question (reported bug)',
        messages: [
            'first you share you have 24 hurs maid ?',
        ]
    },
    {
        id: 'real_faq_02',
        intent: 'general',
        scenario: 'Services question',
        messages: [
            'What services do you offer?',
        ]
    },
    {
        id: 'real_faq_03',
        intent: 'general',
        scenario: 'Spelling mistake',
        messages: [
            'do u hav cook servise?',
        ]
    },
    {
        id: 'real_faq_04',
        intent: 'general',
        scenario: 'Background verification question',
        messages: [
            'Are your maids background verified?',
        ]
    },
    {
        id: 'real_faq_05',
        intent: 'general',
        scenario: 'Multiple FAQ in one session',
        messages: [
            'do you have 24 hour maids?',
            'are they verified?',
            'how does booking work?',
        ]
    },

    // COMPLAINT
    {
        id: 'real_complaint_01',
        intent: 'complaint',
        scenario: 'Maid did not show up',
        messages: [
            'Your maid did not come today!',
            '9876543210',
        ]
    },
    {
        id: 'real_complaint_02',
        intent: 'complaint',
        scenario: 'Theft complaint',
        messages: [
            'My maid stole money from my house',
            '9988776655',
        ]
    },

    // HELPER REGISTRATION
    {
        id: 'real_helper_01',
        intent: 'helper_reg',
        scenario: 'Cook looking for work',
        messages: [
            'I am a good cook, want to find work',
            'My name is Priya, 9876543210',
        ]
    },
    {
        id: 'real_helper_02',
        intent: 'helper_reg',
        scenario: 'Name and phone upfront',
        messages: [
            'I want to register. My name is Sunita Devi, number 9988776655',
        ]
    },
];

// ─── Call Real Bot ────────────────────────────────────────────────────────────
async function callBot(messages, convId) {
    const start = Date.now();
    const res = await fetch(`${BOT_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, id: convId }),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const text = await res.text();
    let botText = '';

    for (const line of text.split('\n')) {
        const deltaMatch = line.match(/"type":"text-delta","delta":"(.*?)"/);
        if (deltaMatch) {
            try { botText += JSON.parse(`"${deltaMatch[1]}"`); } catch { botText += deltaMatch[1]; }
        }
        const simpleMatch = line.match(/^0:"(.*)"/);
        if (simpleMatch) {
            try { botText += JSON.parse(`"${simpleMatch[1]}"`); } catch { botText += simpleMatch[1]; }
        }
    }

    return { text: (botText || text).trim(), latencyMs };
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function cell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }
function row(...cells) { return cells.map(cell).join(',') + '\r\n'; }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\nCapturing REAL bot responses from: ${BOT_URL}`);
    console.log(`Conversations: ${CONVERSATIONS.length}\n`);

    // Check bot is reachable
    try {
        await fetch(`${BOT_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (e) {
        console.error(`❌ Cannot reach ${BOT_URL}`);
        process.exit(1);
    }

    // CSV header
    let csv = row(
        'Conv ID',
        'Intent',
        'Scenario',
        'Turn #',
        'Role',
        'Message',
        'Response Time (ms)',
        'CORRECT? (yes/no)',       // ← you fill this
        'What should it have said?', // ← you fill this if wrong
        'Score (1-5)'              // ← you fill this
    );
    csv += row('','','','','','','','','','');

    const jsonlRecords = [];
    let success = 0, fail = 0;

    for (const conv of CONVERSATIONS) {
        process.stdout.write(`  [${conv.id}] ${conv.scenario}... `);

        const chatHistory = [];
        const capturedTurns = [];
        let convFailed = false;

        for (let i = 0; i < conv.messages.length; i++) {
            const userMsg = conv.messages[i];
            chatHistory.push({ role: 'user', content: userMsg });

            try {
                const { text: botReply, latencyMs } = await callBot([...chatHistory], conv.id);
                chatHistory.push({ role: 'assistant', content: botReply });

                capturedTurns.push(
                    { role: 'user',      content: userMsg,  latencyMs: null  },
                    { role: 'assistant', content: botReply, latencyMs        }
                );

                // CSV rows for this turn
                csv += row(
                    i === 0 ? conv.id : '',
                    i === 0 ? conv.intent : '',
                    i === 0 ? conv.scenario : '',
                    i + 1,
                    '👤 Customer',
                    userMsg,
                    '',
                    '', '', ''
                );
                csv += row(
                    '', '', '',
                    '',
                    '🤖 Real Bot',
                    botReply,
                    latencyMs,
                    '',   // CORRECT? — blank for human
                    '',   // What should it say — blank for human
                    ''    // Score — blank for human
                );

                await new Promise(r => setTimeout(r, 800));
            } catch (e) {
                convFailed = true;
                csv += row(conv.id, conv.intent, conv.scenario, i+1, '💥 ERROR', e.message, '', '', '', '');
                break;
            }
        }

        // Separator
        csv += row('','','','','── end of conversation ──','','','','','');
        csv += row('','','','','','','','','','');

        if (!convFailed) {
            success++;
            const lastBot = capturedTurns.filter(t => t.role === 'assistant').pop();
            console.log(`✅ ${capturedTurns.length} turns, last response ${lastBot?.latencyMs}ms`);

            jsonlRecords.push({
                id: conv.id,
                intent: conv.intent,
                scenario: conv.scenario,
                source: 'real_bot',
                bot_url: BOT_URL,
                turns: capturedTurns,
                captured_at: new Date().toISOString(),
                reviewed: false,
                approved: null,
            });
        } else {
            fail++;
            console.log('❌ FAILED');
        }

        await new Promise(r => setTimeout(r, 1200));
    }

    // Write files
    fs.writeFileSync(CSV_PATH, '\uFEFF' + csv);
    fs.writeFileSync(JSONL_PATH, jsonlRecords.map(r => JSON.stringify(r)).join('\n') + '\n');

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`✅ Captured: ${success} conversations (${fail} failed)`);
    console.log(`📊 CSV:   ${CSV_PATH}  ← open in Excel to review`);
    console.log(`📄 JSONL: ${JSONL_PATH}`);
    console.log(`\nHow to review:`);
    console.log(`  • Open data/real-responses-review.csv in Excel`);
    console.log(`  • Read each bot response`);
    console.log(`  • Fill "CORRECT? (yes/no)" — was the bot's answer right?`);
    console.log(`  • If wrong, fill "What should it have said?" column`);
    console.log(`  • Fill "Score (1-5)" — quality of the response`);
    console.log(`${'─'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
