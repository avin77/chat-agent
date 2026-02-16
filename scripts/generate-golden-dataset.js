#!/usr/bin/env node
/**
 * Golden Dataset Generator for EzyBot
 * Generates realistic multi-turn conversations using Gemini,
 * then saves them in JSONL format for use as ground truth in evals.
 *
 * Usage:
 *   node scripts/generate-golden-dataset.js
 *   node scripts/generate-golden-dataset.js --count=50 --intent=maid_hire
 *
 * Output:
 *   data/golden-dataset.jsonl  — append mode, safe to re-run
 *   data/golden-dataset-review.json — human-readable version for review
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

const COUNT = parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1] || '20');
const INTENT_FILTER = process.argv.find(a => a.startsWith('--intent='))?.split('=')[1] || null;

// Output paths
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const JSONL_PATH = path.join(DATA_DIR, 'golden-dataset.jsonl');
const REVIEW_PATH = path.join(DATA_DIR, 'golden-dataset-review.json');

// ─── Conversation Scenarios to Generate ──────────────────────────────────────
const SCENARIOS = [
    // MAID HIRE — various customer types and communication styles
    {
        intent: 'maid_hire',
        persona: 'Professional who gives all info upfront in one message',
        seed: 'I need a full-time cook in Koramangala, my number is 9876543210',
    },
    {
        intent: 'maid_hire',
        persona: 'Elderly person who types slowly and gives info one piece at a time',
        seed: 'want maid',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who asks a question first before deciding to hire',
        seed: 'do you have part time maids?',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who types in Hinglish (mix of Hindi and English)',
        seed: 'mujhe ek maid chahiye cooking ke liye',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who gives an invalid short phone number first, then corrects it',
        seed: 'I need cleaning help, my number is 98765',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who asks about pricing multiple times',
        seed: 'I want to hire a maid, how much will it cost?',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer from a city outside Bengaluru (Mumbai)',
        seed: 'I need a maid in Mumbai',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who needs baby care specifically',
        seed: 'Looking for someone to take care of my 6 month old baby',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who needs elderly care',
        seed: 'My mother is 78 years old, I need a full-time caretaker',
    },
    {
        intent: 'maid_hire',
        persona: 'Customer who provides phone number without being asked',
        seed: 'Hi, my number is 9988776655, I need a maid',
    },

    // COMPLAINT — various types of complaints
    {
        intent: 'complaint',
        persona: 'Angry customer whose maid did not show up',
        seed: 'Your maid did not come today and I have guests coming!',
    },
    {
        intent: 'complaint',
        persona: 'Customer complaining about theft',
        seed: 'My maid stole money from my house',
    },
    {
        intent: 'complaint',
        persona: 'Customer complaining about quality of work',
        seed: 'The maid you sent does very poor cleaning',
    },
    {
        intent: 'complaint',
        persona: 'Customer who gives phone immediately with complaint',
        seed: 'Bad service, maid broke my dishes. Call me on 9876543210',
    },

    // HELPER REGISTRATION — people looking for work
    {
        intent: 'helper_reg',
        persona: 'Helper who gives name and phone in first message',
        seed: 'I want to register for work. My name is Sunita, 9876543210',
    },
    {
        intent: 'helper_reg',
        persona: 'Helper who gives only their skill first',
        seed: 'I am a good cook, want to find work',
    },
    {
        intent: 'helper_reg',
        persona: 'Helper with experience in baby care',
        seed: 'I have 5 years experience in baby care, looking for job',
    },

    // GENERAL FAQ
    {
        intent: 'general',
        persona: 'Customer asking multiple FAQ questions in one session',
        seed: 'do you have 24 hour maids? are they verified? how does booking work?',
    },
    {
        intent: 'general',
        persona: 'Customer greeting and asking basic info',
        seed: 'Hello',
    },
    {
        intent: 'general',
        persona: 'Customer with typos asking about services',
        seed: 'wat servisess u provid?',
    },
];

// ─── Generate one conversation via Gemini ────────────────────────────────────
async function generateConversation(scenario, idx) {
    const systemPrompt = `You are simulating a realistic WhatsApp conversation between a CUSTOMER and EzyBot (AI customer support for EzyHelpers.com — domestic help service in Bengaluru).

EzyBot's behaviour:
- For maid_hire: Collects phone → area in Bengaluru → service type → schedule → salary expectation → family size → experience → escalates with [ESCALATE]
- For complaint: Collects phone, escalates with [ESCALATE]
- For helper_reg: Collects name + phone → work type → escalates with [ESCALATE]
- For general/FAQ: Answers questions directly, mentions services (Cooking/Cleaning/Baby Care/Elderly Care), never gives prices, Bengaluru only
- EzyBot NEVER gives prices (₹ amounts)
- EzyBot NEVER sends external links
- EzyBot keeps responses to 1-2 sentences

CUSTOMER PERSONA: ${scenario.persona}
INTENT: ${scenario.intent}
OPENING MESSAGE: "${scenario.seed}"

Generate a realistic complete conversation. Format as JSON array:
[
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "...", "ideal": true, "score": 5, "issues": []},
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "...", "ideal": true, "score": 4, "issues": ["could be more empathetic"]},
  ...
]

Rules:
- score: 1-5 (5 = perfect, 1 = wrong/harmful)
- ideal: true if the response is what the bot SHOULD say, false if it's a mistake
- issues: list any problems with the bot response (empty array if perfect)
- Generate 4-10 turns total
- Make the conversation realistic — customers make typos, ask off-topic questions, give incomplete info
- The conversation should naturally reach a conclusion (escalation or clear ending)
- Return ONLY the JSON array, no other text`;

    const body = JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemma-3-27b-it:generateContent?key=${API_KEY}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    // Extract JSON array from response
                    const match = text.match(/\[[\s\S]*\]/);
                    if (!match) throw new Error('No JSON array in response');
                    const turns = JSON.parse(match[0]);
                    resolve(turns);
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Extract metadata from conversation ──────────────────────────────────────
function extractMetadata(turns) {
    const allText = turns.map(t => t.content).join(' ');
    const phoneMatch = allText.match(/\b[6-9]\d{9}\b/);
    const nameMatch = turns.find(t => t.role === 'user' && /my name is|i am ([A-Z][a-z]+)/i.test(t.content));
    const escalated = turns.some(t => t.role === 'assistant' && /\[?escalate\]?/i.test(t.content));
    const completed = escalated;
    const avgScore = turns
        .filter(t => t.role === 'assistant' && t.score)
        .reduce((sum, t, _, arr) => sum + t.score / arr.length, 0);

    return {
        phone_collected: phoneMatch?.[0] || null,
        name_collected: nameMatch ? (nameMatch.content.match(/my name is ([A-Za-z]+)/i)?.[1] || null) : null,
        escalated,
        completed,
        avg_bot_score: Math.round(avgScore * 10) / 10,
        total_turns: turns.length,
        has_issues: turns.some(t => t.issues && t.issues.length > 0),
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const scenarios = INTENT_FILTER
        ? SCENARIOS.filter(s => s.intent === INTENT_FILTER)
        : SCENARIOS;

    const toGenerate = scenarios.slice(0, COUNT);

    console.log(`\nGenerating ${toGenerate.length} golden conversations...`);
    console.log(`Output: ${JSONL_PATH}\n`);

    const generated = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toGenerate.length; i++) {
        const scenario = toGenerate[i];
        process.stdout.write(`  [${i + 1}/${toGenerate.length}] ${scenario.intent} — ${scenario.persona.substring(0, 50)}... `);

        try {
            const turns = await generateConversation(scenario, i);
            const metadata = extractMetadata(turns);

            const record = {
                id: `golden_${scenario.intent}_${String(i + 1).padStart(3, '0')}`,
                intent: scenario.intent,
                persona: scenario.persona,
                seed_message: scenario.seed,
                turns,
                metadata,
                generated_at: new Date().toISOString(),
                reviewed: false,      // set to true after human review
                approved: null,       // set to true/false after human review
            };

            // Append to JSONL
            fs.appendFileSync(JSONL_PATH, JSON.stringify(record) + '\n');
            generated.push(record);
            successCount++;

            const quality = metadata.avg_bot_score >= 4 ? '✅' : metadata.avg_bot_score >= 3 ? '⚠️' : '❌';
            console.log(`${quality} ${turns.length} turns, score ${metadata.avg_bot_score}, escalated: ${metadata.escalated}`);
        } catch (e) {
            console.log(`💥 FAILED: ${e.message}`);
            failCount++;
        }

        // Rate limit delay
        await new Promise(r => setTimeout(r, 1500));
    }

    // Write human-readable review file
    fs.writeFileSync(REVIEW_PATH, JSON.stringify(generated, null, 2));

    // Summary
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Generated: ${successCount} conversations (${failCount} failed)`);
    console.log(`JSONL:     ${JSONL_PATH}`);
    console.log(`Review:    ${REVIEW_PATH}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Open data/golden-dataset-review.json`);
    console.log(`  2. Check each conversation — set "approved": true/false`);
    console.log(`  3. Fix bot responses where "ideal": false`);
    console.log(`  4. Run: node scripts/build-eval-from-golden.js`);
    console.log(`     (converts approved golden data into eval.js test cases)`);
    console.log(`${'─'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
