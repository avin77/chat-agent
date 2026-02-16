#!/usr/bin/env node
/**
 * Generates golden dataset conversations via Gemini and exports to CSV.
 * Opens directly in Excel / Google Sheets for human review.
 *
 * Usage:
 *   node scripts/golden-to-csv.js
 *   node scripts/golden-to-csv.js --count=10 --intent=maid_hire
 *
 * Output: data/golden-review.csv
 *
 * Excel columns:
 *   Conv ID | Intent | Persona | Turn | Role | Message | Bot Score | Issues | APPROVE (you fill this)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load env
try {
    const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    for (const line of env.split('\n')) {
        const [k, ...v] = line.split('=');
        if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    }
} catch (e) { console.error('Could not load .env.local'); process.exit(1); }

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!API_KEY) { console.error('Missing GOOGLE_GENERATIVE_AI_API_KEY'); process.exit(1); }

const COUNT  = parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1] || '20');
const FILTER = process.argv.find(a => a.startsWith('--intent='))?.split('=')[1] || null;

const DATA_DIR  = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const CSV_PATH  = path.join(DATA_DIR, 'golden-review.csv');
const JSONL_PATH = path.join(DATA_DIR, 'golden-dataset.jsonl');

// ─── Scenarios ────────────────────────────────────────────────────────────────
const SCENARIOS = [
    // MAID HIRE
    { intent: 'maid_hire', persona: 'Professional gives all info upfront in one message', seed: 'I need a full-time cook in Koramangala, my number is 9876543210' },
    { intent: 'maid_hire', persona: 'Elderly person types slowly, gives info one piece at a time', seed: 'want maid' },
    { intent: 'maid_hire', persona: 'Customer asks a question first before deciding to hire', seed: 'do you have part time maids?' },
    { intent: 'maid_hire', persona: 'Hinglish speaker (mix of Hindi and English)', seed: 'mujhe ek maid chahiye cooking ke liye' },
    { intent: 'maid_hire', persona: 'Customer gives invalid short phone first, then corrects it', seed: 'I need cleaning help, my number is 98765' },
    { intent: 'maid_hire', persona: 'Customer asks about pricing multiple times', seed: 'I want to hire a maid, how much will it cost?' },
    { intent: 'maid_hire', persona: 'Customer from Mumbai (outside service area)', seed: 'I need a maid in Mumbai' },
    { intent: 'maid_hire', persona: 'Customer needs baby care specifically', seed: 'Looking for someone to take care of my 6 month old baby' },
    { intent: 'maid_hire', persona: 'Customer needs elderly care for parent', seed: 'My mother is 78 years old, I need a full-time caretaker' },
    { intent: 'maid_hire', persona: 'Customer sends phone number without being asked first', seed: 'Hi, my number is 9988776655, I need a maid' },

    // COMPLAINT
    { intent: 'complaint', persona: 'Angry customer whose maid did not show up', seed: 'Your maid did not come today and I have guests coming!' },
    { intent: 'complaint', persona: 'Customer complaining about theft', seed: 'My maid stole money from my house' },
    { intent: 'complaint', persona: 'Customer complaining about poor quality of work', seed: 'The maid you sent does very poor cleaning' },
    { intent: 'complaint', persona: 'Customer gives phone number in the same message as complaint', seed: 'Bad service, maid broke my dishes. Call me on 9876543210' },

    // HELPER REGISTRATION
    { intent: 'helper_reg', persona: 'Helper gives name and phone in first message', seed: 'I want to register for work. My name is Sunita, 9876543210' },
    { intent: 'helper_reg', persona: 'Helper mentions only their skill first', seed: 'I am a good cook, want to find work' },
    { intent: 'helper_reg', persona: 'Helper with baby care experience', seed: 'I have 5 years experience in baby care, looking for job' },

    // GENERAL FAQ
    { intent: 'general', persona: 'Customer asks multiple FAQ questions in one session', seed: 'do you have 24 hour maids? are they verified? how does booking work?' },
    { intent: 'general', persona: 'Customer sends just a greeting', seed: 'Hello' },
    { intent: 'general', persona: 'Customer with heavy typos asking about services', seed: 'wat servisess u provid?' },
];

// ─── CSV escape helper ────────────────────────────────────────────────────────
function csvCell(val) {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
}

function csvRow(...cells) {
    return cells.map(csvCell).join(',') + '\r\n';
}

// ─── Call Gemini ──────────────────────────────────────────────────────────────
async function generateConversation(scenario) {
    const prompt = `You are simulating a realistic WhatsApp chat between a CUSTOMER and EzyBot.

EzyBot is customer support for EzyHelpers.com — domestic help service in Bengaluru only.

EzyBot rules:
- maid_hire: ask phone → area in Bengaluru → service type → schedule → salary expectation → family size → prior experience → end with [ESCALATE]
- complaint: ask for phone → acknowledge → [ESCALATE]
- helper_reg: ask name + phone → work type → [ESCALATE]
- general/FAQ: answer the question directly, briefly. Never give prices (₹ amounts). Never share external links.
- Always keep bot replies to 1-2 sentences max.
- If city is NOT Bengaluru, say "we only operate in Bengaluru currently".

CUSTOMER PERSONA: ${scenario.persona}
INTENT: ${scenario.intent}
CUSTOMER OPENS WITH: "${scenario.seed}"

Generate a realistic complete multi-turn conversation (4-10 turns).
Make the customer realistic — typos, unclear messages, asking side questions, giving partial info.

Return ONLY a JSON array, no other text:
[
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "...", "score": 5, "issues": ""},
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "...", "score": 4, "issues": "slightly too long"},
  ...
]

score = 1-5 (5 = perfect response, 1 = wrong/harmful)
issues = short text describing any problem, empty string if none`;

    const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 2048 }
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemma-3-27b-it:generateContent?key=${API_KEY}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    const match = text.match(/\[[\s\S]*\]/);
                    if (!match) throw new Error('No JSON array found in response');
                    resolve(JSON.parse(match[0]));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const scenarios = (FILTER ? SCENARIOS.filter(s => s.intent === FILTER) : SCENARIOS).slice(0, COUNT);

    console.log(`\nGenerating ${scenarios.length} conversations...`);
    console.log(`Output CSV: ${CSV_PATH}\n`);

    // CSV header
    let csv = csvRow(
        'Conv ID',
        'Intent',
        'Persona',
        'Turn #',
        'Role',
        'Message',
        'Bot Score (1-5)',
        'Issues',
        'APPROVE? (yes/no)',   // ← you fill this column
        'Notes'                // ← optional notes
    );

    // Blank separator row for readability
    csv += csvRow('', '', '', '', '', '', '', '', '', '') ;

    const jsonlRecords = [];
    let success = 0, fail = 0;

    for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        const convId = `conv_${scenario.intent}_${String(i + 1).padStart(3, '0')}`;
        process.stdout.write(`  [${i + 1}/${scenarios.length}] ${scenario.intent} — ${scenario.persona.substring(0, 45)}... `);

        try {
            const turns = await generateConversation(scenario);

            // Add to CSV — one row per turn
            for (let t = 0; t < turns.length; t++) {
                const turn = turns[t];
                const isBot = turn.role === 'assistant';
                csv += csvRow(
                    t === 0 ? convId : '',             // Conv ID only on first turn
                    t === 0 ? scenario.intent : '',    // Intent only on first turn
                    t === 0 ? scenario.persona : '',   // Persona only on first turn
                    t + 1,                             // Turn number
                    turn.role === 'user' ? '👤 Customer' : '🤖 EzyBot',
                    turn.content,
                    isBot ? (turn.score || '') : '',   // Score only for bot turns
                    isBot ? (turn.issues || '') : '',  // Issues only for bot turns
                    '',                                // APPROVE — blank for human
                    ''                                 // Notes — blank for human
                );
            }

            // Blank row between conversations
            csv += csvRow('', '', '', '', '── end of conversation ──', '', '', '', '', '');
            csv += csvRow('', '', '', '', '', '', '', '', '', '');

            // Save to JSONL too
            const escalated = turns.some(t => t.role === 'assistant' && /\[?escalate\]?/i.test(t.content));
            const avgScore = turns
                .filter(t => t.role === 'assistant' && t.score)
                .reduce((s, t, _, a) => s + t.score / a.length, 0);
            jsonlRecords.push({
                id: convId, intent: scenario.intent, persona: scenario.persona,
                seed_message: scenario.seed, turns,
                metadata: { escalated, avg_bot_score: Math.round(avgScore * 10) / 10, total_turns: turns.length },
                reviewed: false, approved: null, generated_at: new Date().toISOString()
            });

            success++;
            const avgStr = avgScore.toFixed(1);
            const icon = avgScore >= 4 ? '✅' : avgScore >= 3 ? '⚠️' : '❌';
            console.log(`${icon} ${turns.length} turns, avg score ${avgStr}`);
        } catch (e) {
            console.log(`💥 FAILED: ${e.message}`);
            fail++;
            csv += csvRow(convId, scenario.intent, scenario.persona, '', 'GENERATION FAILED', e.message, '', '', '', '');
            csv += csvRow('', '', '', '', '', '', '', '', '', '');
        }

        await new Promise(r => setTimeout(r, 1500));
    }

    // Write CSV
    fs.writeFileSync(CSV_PATH, '\uFEFF' + csv); // BOM for Excel UTF-8 detection

    // Write JSONL
    fs.writeFileSync(JSONL_PATH,
        jsonlRecords.map(r => JSON.stringify(r)).join('\n') + '\n'
    );

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`✅ Generated: ${success} conversations (${fail} failed)`);
    console.log(`📊 CSV:   ${CSV_PATH}`);
    console.log(`📄 JSONL: ${JSONL_PATH}`);
    console.log(`\nHow to review:`);
    console.log(`  1. Open data/golden-review.csv in Excel or Google Sheets`);
    console.log(`  2. Fill in the "APPROVE? (yes/no)" column for each conversation`);
    console.log(`  3. Add notes in the "Notes" column for anything to fix`);
    console.log(`  4. Save and run: node scripts/build-eval-from-golden.js`);
    console.log(`${'─'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
