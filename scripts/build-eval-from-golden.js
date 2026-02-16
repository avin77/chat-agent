#!/usr/bin/env node
/**
 * Converts approved golden dataset records into eval.js test cases.
 * Run after reviewing data/golden-dataset-review.json.
 *
 * Usage: node scripts/build-eval-from-golden.js
 *
 * Reads:  data/golden-dataset.jsonl
 * Writes: data/golden-eval-cases.js  (paste into eval.js TEST_CASES)
 */

const fs = require('fs');
const path = require('path');

const JSONL_PATH = path.join(__dirname, '../data/golden-dataset.jsonl');
const OUTPUT_PATH = path.join(__dirname, '../data/golden-eval-cases.js');

if (!fs.existsSync(JSONL_PATH)) {
    console.error('No golden dataset found. Run: node scripts/generate-golden-dataset.js');
    process.exit(1);
}

const lines = fs.readFileSync(JSONL_PATH, 'utf-8').trim().split('\n').filter(Boolean);
const records = lines.map(l => JSON.parse(l));

// Only use approved records (reviewed: true, approved: true)
// If nothing is reviewed yet, use all records with avg_bot_score >= 4
const approved = records.filter(r =>
    r.approved === true || (!r.reviewed && r.metadata.avg_bot_score >= 4)
);

console.log(`\nTotal records: ${records.length}`);
console.log(`Approved/high-quality: ${approved.length}`);

const evalCases = [];

for (const record of approved) {
    // Build turns from the conversation
    // Each USER turn becomes a test turn
    // Bot response after that turn becomes the expected behavior
    const turns = [];
    let messageHistory = [];

    for (let i = 0; i < record.turns.length; i++) {
        const turn = record.turns[i];

        if (turn.role === 'user') {
            // Get the bot response that follows this user message
            const botTurn = record.turns[i + 1];
            if (!botTurn || botTurn.role !== 'assistant') continue;

            // Build contains/notContains from the ideal bot response
            const botText = botTurn.content.toLowerCase();
            const contains = [];
            const notContains = [];

            // Extract key words from ideal response as assertions
            // Phone acknowledgement
            if (/\b[6-9]\d{9}\b/.test(botTurn.content)) {
                const phone = botTurn.content.match(/\b[6-9]\d{9}\b/)[0];
                contains.push(phone);
            }
            // Area question
            if (/area|location|where|bengaluru/i.test(botText)) contains.push('area');
            // Phone request
            if (/number|mobile|phone/i.test(botText)) contains.push('number');
            // Service type question
            if (/cooking|cleaning|care|type of/i.test(botText)) contains.push('cook');
            // Empathy for complaints
            if (/sorry|apologize|understand/i.test(botText)) contains.push('sorry');
            // City boundary
            if (/bengaluru only|only in bengaluru/i.test(botText)) {
                contains.push('bengaluru');
                notContains.push('yes we do');
            }
            // No prices ever
            notContains.push('₹');
            notContains.push('rs.');

            // Only add turns with meaningful assertions
            if (contains.length > 0 || notContains.length > 0) {
                turns.push({
                    user: turn.content,
                    ideal_bot_response: botTurn.content,
                    checks: {
                        contains: [...new Set(contains)],
                        notContains: [...new Set(notContains)],
                    }
                });
            }
        }
    }

    if (turns.length === 0) continue;

    evalCases.push({
        id: record.id,
        name: `[Golden] ${record.persona}`,
        category: record.intent.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
        source: 'golden_dataset',
        turns,
        shouldEscalate: record.metadata.escalated,
    });
}

// Write as JS snippet ready to paste into eval.js
const output = `// ── Golden Dataset Test Cases (auto-generated) ──────────────────────────────
// Generated: ${new Date().toISOString()}
// Source: data/golden-dataset.jsonl (${approved.length} approved records)
// Paste these into TEST_CASES array in eval.js

const GOLDEN_TEST_CASES = ${JSON.stringify(evalCases, null, 4)};

module.exports = { GOLDEN_TEST_CASES };
`;

fs.writeFileSync(OUTPUT_PATH, output);

console.log(`\nGenerated ${evalCases.length} eval test cases`);
console.log(`Output: ${OUTPUT_PATH}`);
console.log('\nTo use in eval.js, add at the top:');
console.log("  const { GOLDEN_TEST_CASES } = require('./data/golden-eval-cases.js');");
console.log('  const TEST_CASES = [...HAND_WRITTEN_CASES, ...GOLDEN_TEST_CASES];');
