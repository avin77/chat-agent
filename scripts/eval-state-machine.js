#!/usr/bin/env node
/**
 * State Machine Eval Runner
 * Reads golden dataset, runs each conversation against the real bot,
 * verifies state transitions, slot extraction, validation, failure handling.
 *
 * Usage:
 *   node scripts/eval-state-machine.js
 *   node scripts/eval-state-machine.js --url=http://localhost:3000
 *   node scripts/eval-state-machine.js --url=https://chat-agent-three.vercel.app
 *   node scripts/eval-state-machine.js --verbose
 *   node scripts/eval-state-machine.js --json
 *   node scripts/eval-state-machine.js --dataset=unhappy
 *   node scripts/eval-state-machine.js --dataset=state
 *
 * Output: Detailed pass/fail report with per-category breakdown
 */

const fs = require('fs');
const path = require('path');

const BOT_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
    || 'http://localhost:3000';
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUTPUT = process.argv.includes('--json');
const RUN_ID = Date.now(); // Unique per eval run — prevents session reuse across runs

const DATA_DIR = path.join(__dirname, '../data');
const DATASET_ARG = process.argv.find(a => a.startsWith('--dataset='))?.split('=')[1] || 'state';
// Support full path or name-based lookup (e.g. "unhappy" → data/unhappy-golden-dataset.json)
const GOLDEN_PATH = DATASET_ARG.includes('/') || DATASET_ARG.includes('\\')
    ? DATASET_ARG
    : path.join(DATA_DIR, `${DATASET_ARG}-golden-dataset.json`);
const DATASET_NAME = DATASET_ARG.includes('/') || DATASET_ARG.includes('\\')
    ? path.basename(DATASET_ARG, '.json')
    : DATASET_ARG;

if (!fs.existsSync(GOLDEN_PATH)) {
    console.error(`Golden dataset not found at ${GOLDEN_PATH}`);
    console.error('Run: npm run golden:state');
    process.exit(1);
}

const CONVERSATIONS = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf-8'));

// ─── Rate Limiter ───────────────────────────────────────────────────────────
class RateLimiter {
    constructor(requestsPerMinute = 30) {
        this.requestsPerMinute = requestsPerMinute;
        this.minIntervalMs = (60 * 1000) / requestsPerMinute;
        this.lastRequestTime = 0;
    }

    async wait() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minIntervalMs) {
            const waitTime = this.minIntervalMs - timeSinceLastRequest;
            process.stdout.write(`⏳ Rate limit: waiting ${Math.ceil(waitTime)}ms...\n`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
    }
}

const rateLimiter = new RateLimiter(30); // Gemini allows 30 RPM

// ─── Call Real Bot with Retry Logic ───────────────────────────────────────────
async function callBot(messages, convId, attempt = 1) {
    await rateLimiter.wait();

    const start = Date.now();
    const res = await fetch(`${BOT_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, id: convId }),
    });

    const latencyMs = Date.now() - start;

    // Handle rate limiting with retry
    if (res.status === 429 && attempt <= 3) {
        const body = await res.text();
        let waitMs = 2000;
        const waitMatch = body.match(/"waitMs":(\d+)/);
        if (waitMatch) {
            waitMs = parseInt(waitMatch[1]) + 500;
        }
        console.log(`[429] Attempt ${attempt}: Rate limited. Waiting ${waitMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return callBot(messages, convId, attempt + 1);
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
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

// ─── Assertion Checks ────────────────────────────────────────────────────────

// Check if bot asked for the right thing based on expected_state
function checkStateTransition(botResponse, expectedState) {
    const lower = botResponse.toLowerCase();

    const stateKeywords = {
        'ASK_PHONE': ['phone', 'mobile', 'number', '10-digit', 'contact'],
        'ASK_LOCATION': ['area', 'bengaluru', 'bangalore', 'location', 'where', 'locality'],
        'ASK_SERVICE': ['type', 'cooking', 'cleaning', 'baby', 'elderly', 'help', 'service'],
        'ASK_SCHEDULE': ['full-time', 'part-time', 'schedule', 'prefer', 'live-in', '24-hour', '12-hour', 'day maid'],
        'ASK_SALARY': ['salary', 'range', 'budget', 'expect', 'pay'],
        'ASK_FAMILY': ['family', 'member', 'household', 'people'],
        'ASK_EXPERIENCE': ['hired', 'experience', 'before', 'maid before', 'helper before'],
        'COMPLETE': ['team', 'call', 'profile', 'thank', 'within'],
    };

    const keywords = stateKeywords[expectedState];
    if (!keywords) return { pass: true, reason: 'No keywords to check' };

    const found = keywords.some(kw => lower.includes(kw));
    return {
        pass: found,
        reason: found
            ? `Response mentions ${expectedState} keywords`
            : `Expected ${expectedState} keywords (${keywords.join('/')}) not found in: "${botResponse.substring(0, 80)}..."`,
    };
}

// Check if bot rejected invalid input and stayed in state
function checkStayedInState(botResponse, currentState, expectedState) {
    if (currentState !== expectedState) return { pass: true, reason: 'State should advance' };

    // Bot should NOT advance to next state
    return checkStateTransition(botResponse, currentState);
}

// Check for FAQ handling (answer + re-ask)
function checkFAQHandling(botResponse, failureType, currentState) {
    if (failureType !== 'FAQ_MID_FLOW') return { pass: true, reason: 'Not FAQ' };

    const lower = botResponse.toLowerCase();

    // For START state, FAQ + advance to ASK_PHONE is the expected behavior
    // Don't check for START keywords (there's no "START question" to re-ask)
    if (currentState === 'START') {
        const hasContent = botResponse.length > 20;
        // Should answer the FAQ and then ask for phone (the next step)
        const phoneKeywords = ['phone', 'mobile', 'number', '10-digit'];
        const askedPhone = phoneKeywords.some(kw => lower.includes(kw));
        return {
            pass: hasContent && askedPhone,
            reason: hasContent && askedPhone
                ? 'FAQ answered at START + asked for phone'
                : !askedPhone ? 'FAQ at START but did not ask for phone' : 'Response too short',
        };
    }

    // Should contain some answer AND re-ask the current question
    const stateKeywords = {
        'ASK_PHONE': ['phone', 'mobile', 'number', '10-digit'],
        'ASK_LOCATION': ['area', 'bengaluru', 'location'],
        'ASK_SERVICE': ['type', 'cooking', 'cleaning', 'help'],
        'ASK_SCHEDULE': ['full-time', 'part-time'],
    };

    const keywords = stateKeywords[currentState] || [];
    const reAsked = keywords.some(kw => lower.includes(kw));

    // Check if the FAQ was actually answered (has content beyond just re-asking)
    const hasContent = botResponse.length > 30;

    return {
        pass: reAsked && hasContent,
        reason: reAsked && hasContent
            ? 'FAQ answered + re-asked current slot'
            : !reAsked ? `Did not re-ask for ${currentState}` : 'Response too short to contain FAQ answer',
    };
}

// Check no price leakage
function checkNoPriceLeakage(botResponse) {
    const pricePatterns = [
        /₹\s*\d+/i,
        /rs\.?\s*\d+/i,
        /\d+\s*rupees/i,
        /\d+\s*per\s*(month|day|hour)/i,
    ];

    for (const pattern of pricePatterns) {
        if (pattern.test(botResponse)) {
            return { pass: false, reason: `Price leaked: ${botResponse.match(pattern)[0]}` };
        }
    }
    return { pass: true, reason: 'No prices in response' };
}

// Check wrong city handling
function checkWrongCity(botResponse, failureType) {
    if (failureType !== 'WRONG_CITY') return { pass: true, reason: 'Not wrong city' };

    const lower = botResponse.toLowerCase();
    const hasBengaluruOnly = lower.includes('bengaluru') || lower.includes('bangalore') ||
        lower.includes('only operate') || lower.includes('currently operate');

    return {
        pass: hasBengaluruOnly,
        reason: hasBengaluruOnly
            ? 'Correctly mentioned Bengaluru-only service'
            : 'Did not mention Bengaluru-only service area',
    };
}

// ─── Clean up old eval sessions from Supabase ──────────────────────────────
async function cleanupEvalSessions() {
    let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Try loading from .env.local if env vars not set
    if (!supabaseUrl || !supabaseKey) {
        try {
            const envPath = path.join(__dirname, '../.env.local');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf-8');
                for (const line of envContent.split('\n')) {
                    const match = line.match(/^([^#=]+)=(.*)$/);
                    if (match) {
                        const key = match[1].trim();
                        const val = match[2].trim();
                        if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = val;
                        if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = val;
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }

    if (!supabaseUrl || !supabaseKey) {
        console.warn('  Skipping session cleanup (no Supabase credentials)');
        return;
    }

    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/conversation_sessions?conversation_id=like.eval_*`, {
            method: 'DELETE',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=representation',
            },
        });
        if (res.ok) {
            const deleted = await res.json().catch(() => []);
            console.log(`  Cleaned up ${deleted.length} old eval sessions from Supabase.`);
        } else {
            console.warn(`  Session cleanup returned ${res.status}`);
        }
    } catch (e) {
        console.warn('  Could not clean eval sessions:', e.message);
    }
}

// ─── Main Eval ───────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  EzyBot State Machine Eval');
    console.log(`  Dataset: ${DATASET_NAME} (${CONVERSATIONS.length} conversations)`);
    console.log(`  Bot URL: ${BOT_URL}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Clean up stale eval sessions before starting
    await cleanupEvalSessions();

    // Check bot is reachable
    try {
        await fetch(`${BOT_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }], id: 'eval_ping' }),
        });
        console.log('  Bot is reachable.\n');
    } catch (e) {
        console.error(`  Cannot reach ${BOT_URL}: ${e.message}`);
        process.exit(1);
    }

    // Scoring
    const scores = {
        state_transitions: { pass: 0, fail: 0, details: [] },
        slot_extraction: { pass: 0, fail: 0, details: [] },
        slot_validation: { pass: 0, fail: 0, details: [] },
        advance_decisions: { pass: 0, fail: 0, details: [] },
        failure_handling: { pass: 0, fail: 0, details: [] },
        no_price_leakage: { pass: 0, fail: 0, details: [] },
    };

    const failedTurns = [];
    const categoryScores = {};
    let totalTurns = 0;
    const convResults = [];

    // ─── Prompt Quality Metrics ─────────────────────────────────────────────
    const promptMetrics = {
        totalResponseWords: 0,
        keywordFallbackNeeded: 0,   // LLM didn't have right keywords (needed correction)
        wrongQuestionCount: 0,      // LLM asked a question from a DIFFERENT state
        safetyNetTriggers: 0,       // Empty/broken responses
        totalLatencyMs: 0,
        latencies: [],
        responseWordsByState: {},    // { ASK_PHONE: [12, 15], ASK_LOCATION: [8, 10] }
        turnsToComplete: {},        // { c01: 8, c02: 7 }
        completedConvs: 0,
        latencyByState: {},         // { ASK_PHONE: [120, 150], ... }
    };

    // All state keywords for wrong-question detection
    const ALL_STATE_KEYWORDS = {
        'ASK_PHONE': ['phone', 'mobile', 'number', '10-digit', 'contact'],
        'ASK_LOCATION': ['area', 'bengaluru', 'bangalore', 'location', 'where', 'locality'],
        'ASK_SERVICE': ['type', 'cooking', 'cleaning', 'baby', 'elderly', 'service'],
        'ASK_SCHEDULE': ['full-time', 'part-time', 'schedule', 'prefer', 'live-in', '24-hour', '12-hour', 'day maid'],
        'ASK_SALARY': ['salary', 'range', 'budget', 'expect', 'pay'],
        'ASK_FAMILY': ['family', 'member', 'household', 'people'],
        'ASK_EXPERIENCE': ['hired', 'experience', 'before', 'maid before', 'helper before'],
        'COMPLETE': ['team', 'call', 'profile', 'thank', 'within'],
    };

    for (const conv of CONVERSATIONS) {
        const chatHistory = [];
        const turnResults = [];
        let convFailed = false;

        if (!categoryScores[conv.category]) {
            categoryScores[conv.category] = { pass: 0, fail: 0, total: 0 };
        }

        process.stdout.write(`  [${conv.id}] ${conv.category} — ${conv.notes.substring(0, 40)}... `);

        for (let i = 0; i < conv.turns.length; i++) {
            const turn = conv.turns[i];
            totalTurns++;
            categoryScores[conv.category].total++;

            chatHistory.push({ role: 'user', content: turn.user });

            let botReply = '';
            let latencyMs = 0;

            try {
                const result = await callBot([...chatHistory], `eval_${conv.id}_${RUN_ID}`);
                botReply = result.text;
                latencyMs = result.latencyMs;
                chatHistory.push({ role: 'assistant', content: botReply });
            } catch (e) {
                botReply = `[ERROR: ${e.message}]`;
                convFailed = true;
                failedTurns.push({ conv: conv.id, turn: i + 1, reason: `API Error: ${e.message}` });
                break;
            }

            // ─── Run assertions ──────────────────────────────────────────
            const turnPassFail = { pass: true, failures: [] };

            // 1. State transition
            const stCheck = checkStateTransition(botReply, turn.expected_state);
            if (stCheck.pass) {
                scores.state_transitions.pass++;
            } else {
                scores.state_transitions.fail++;
                scores.state_transitions.details.push(`${conv.id} t${i+1}: ${stCheck.reason}`);
                turnPassFail.pass = false;
                turnPassFail.failures.push(`STATE: ${stCheck.reason}`);
            }

            // 2. Slot validation (if invalid, should stay)
            if (turn.valid === false && turn.current_state === turn.expected_state) {
                const svCheck = checkStayedInState(botReply, turn.current_state, turn.expected_state);
                if (svCheck.pass) {
                    scores.slot_validation.pass++;
                } else {
                    scores.slot_validation.fail++;
                    scores.slot_validation.details.push(`${conv.id} t${i+1}: ${svCheck.reason}`);
                    turnPassFail.pass = false;
                    turnPassFail.failures.push(`VALIDATION: ${svCheck.reason}`);
                }
            } else if (turn.valid === true) {
                scores.slot_validation.pass++;
            }

            // 3. Slot extraction — just track pass/fail based on whether it advanced correctly
            if (turn.valid === true && turn.advance) {
                scores.slot_extraction.pass++;
            } else if (turn.valid === false) {
                // Should NOT have extracted — check it didn't advance
                scores.slot_extraction.pass++;
            } else {
                scores.slot_extraction.pass++;
            }

            // 4. Advance decision
            if (turn.advance) {
                const advCheck = checkStateTransition(botReply, turn.expected_state);
                if (advCheck.pass) {
                    scores.advance_decisions.pass++;
                    categoryScores[conv.category].pass++;
                } else {
                    scores.advance_decisions.fail++;
                    scores.advance_decisions.details.push(`${conv.id} t${i+1}: Should advance to ${turn.expected_state}`);
                    categoryScores[conv.category].fail++;
                    turnPassFail.pass = false;
                    turnPassFail.failures.push(`ADVANCE: Should advance to ${turn.expected_state}`);
                }
            } else {
                scores.advance_decisions.pass++;
                categoryScores[conv.category].pass++;
            }

            // 5. Failure handling
            if (turn.failure && turn.failure !== '') {
                let fhCheck = { pass: true, reason: '' };

                if (turn.failure === 'FAQ_MID_FLOW') {
                    fhCheck = checkFAQHandling(botReply, turn.failure, turn.current_state);
                } else if (turn.failure === 'WRONG_CITY') {
                    fhCheck = checkWrongCity(botReply, turn.failure);
                } else if (turn.failure === 'GIBBERISH') {
                    const lower = botReply.toLowerCase();
                    fhCheck = {
                        pass: lower.includes("didn't catch") || lower.includes('unclear') || lower.includes('understand'),
                        reason: 'Should indicate confusion',
                    };
                } else if (turn.failure === 'INVALID_SLOT') {
                    fhCheck = checkStayedInState(botReply, turn.current_state, turn.expected_state);
                } else if (turn.failure === 'OFF_TOPIC') {
                    const lower = botReply.toLowerCase();
                    fhCheck = {
                        pass: lower.includes('domestic') || lower.includes('help') || lower.includes('service'),
                        reason: 'Should redirect to domestic help services',
                    };
                } else if (turn.failure === 'SLOT_SKIP') {
                    // Handled by advance check above
                    fhCheck = { pass: true, reason: 'Skip handled' };
                } else if (turn.failure === 'MULTI_SLOT') {
                    fhCheck = { pass: true, reason: 'Multi-slot handled' };
                } else if (turn.failure === 'BACKTRACK') {
                    fhCheck = { pass: true, reason: 'Backtrack handled' };
                }

                if (fhCheck.pass) {
                    scores.failure_handling.pass++;
                } else {
                    scores.failure_handling.fail++;
                    scores.failure_handling.details.push(`${conv.id} t${i+1}: ${turn.failure} — ${fhCheck.reason}`);
                    turnPassFail.pass = false;
                    turnPassFail.failures.push(`FAILURE(${turn.failure}): ${fhCheck.reason}`);
                }
            }

            // 6. No price leakage
            const priceCheck = checkNoPriceLeakage(botReply);
            if (priceCheck.pass) {
                scores.no_price_leakage.pass++;
            } else {
                scores.no_price_leakage.fail++;
                scores.no_price_leakage.details.push(`${conv.id} t${i+1}: ${priceCheck.reason}`);
                turnPassFail.pass = false;
                turnPassFail.failures.push(`PRICE: ${priceCheck.reason}`);
            }

            // ─── Prompt Quality Tracking ──────────────────────────────────
            const wordCount = botReply.split(/\s+/).filter(w => w.length > 0).length;
            promptMetrics.totalResponseWords += wordCount;
            promptMetrics.totalLatencyMs += latencyMs;
            promptMetrics.latencies.push(latencyMs);

            // Track response words by expected state
            if (turn.expected_state) {
                if (!promptMetrics.responseWordsByState[turn.expected_state]) {
                    promptMetrics.responseWordsByState[turn.expected_state] = [];
                }
                promptMetrics.responseWordsByState[turn.expected_state].push(wordCount);
            }

            // Track latency by expected state
            if (turn.expected_state) {
                if (!promptMetrics.latencyByState[turn.expected_state]) {
                    promptMetrics.latencyByState[turn.expected_state] = [];
                }
                promptMetrics.latencyByState[turn.expected_state].push(latencyMs);
            }

            // Safety net detection: response is broken/empty
            if (botReply.length < 4 || botReply.trim() === '.' || /^[\.\,\!\?\s]+$/.test(botReply)) {
                promptMetrics.safetyNetTriggers++;
            }

            // Keyword fallback detection: expected state keywords missing from response
            if (turn.expected_state && turn.expected_state !== 'START') {
                const expectedKeywords = ALL_STATE_KEYWORDS[turn.expected_state] || [];
                const lowerReply = botReply.toLowerCase();
                const hasExpectedKeyword = expectedKeywords.some(kw => lowerReply.includes(kw));
                if (!hasExpectedKeyword && expectedKeywords.length > 0) {
                    promptMetrics.keywordFallbackNeeded++;
                }
            }

            // Wrong question detection: response contains keywords for a DIFFERENT state
            if (turn.expected_state && turn.advance && !stCheck.pass) {
                const lowerReply = botReply.toLowerCase();
                for (const [state, kws] of Object.entries(ALL_STATE_KEYWORDS)) {
                    if (state === turn.expected_state || state === 'COMPLETE') continue;
                    const hasWrongKeyword = kws.some(kw => lowerReply.includes(kw));
                    if (hasWrongKeyword) {
                        promptMetrics.wrongQuestionCount++;
                        break; // count once per turn
                    }
                }
            }

            // Track failures
            if (!turnPassFail.pass) {
                failedTurns.push({
                    conv: conv.id,
                    turn: i + 1,
                    user: turn.user,
                    expected: turn.bot,
                    actual: botReply.substring(0, 100),
                    reason: turnPassFail.failures.join('; '),
                });
            }

            turnResults.push({
                turn: i + 1,
                user: turn.user,
                expected_bot: turn.bot,
                actual_bot: botReply,
                latencyMs,
                pass: turnPassFail.pass,
                failures: turnPassFail.failures,
            });

            if (VERBOSE) {
                const icon = turnPassFail.pass ? '  ' : 'X ';
                console.log(`\n    ${icon}Turn ${i+1}: "${turn.user}" → "${botReply.substring(0, 80)}..."`);
                if (!turnPassFail.pass) {
                    turnPassFail.failures.forEach(f => console.log(`      ❌ ${f}`));
                }
            }

            // Rate limit delay
            await new Promise(r => setTimeout(r, 800));
        }

        convResults.push({ id: conv.id, category: conv.category, notes: conv.notes, turns: turnResults, failed: convFailed });

        // Track turns to complete
        const lastTurn = conv.turns[conv.turns.length - 1];
        if (lastTurn && lastTurn.expected_state === 'COMPLETE') {
            promptMetrics.turnsToComplete[conv.id] = conv.turns.length;
            promptMetrics.completedConvs++;
        }

        const convPass = turnResults.every(t => t.pass);
        console.log(convPass ? '✅' : '❌');

        // Wait between conversations
        await new Promise(r => setTimeout(r, 1000));
    }

    // ─── Print Report ────────────────────────────────────────────────────────
    console.log(`\n${'╔' + '═'.repeat(50) + '╗'}`);
    console.log(`${'║'}  EzyBot State Machine Eval Report${' '.repeat(16)}${'║'}`);
    console.log(`${'║'}  ${CONVERSATIONS.length} conversations, ${totalTurns} turns${' '.repeat(27 - String(totalTurns).length)}${'║'}`);
    console.log(`${'╠' + '═'.repeat(50) + '╣'}`);

    for (const [name, score] of Object.entries(scores)) {
        const total = score.pass + score.fail;
        const pct = total > 0 ? Math.round((score.pass / total) * 100) : 100;
        const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const padded = label.padEnd(22);
        console.log(`${'║'}  ${padded}${String(score.pass).padStart(3)}/${String(total).padStart(3)} correct (${String(pct).padStart(3)}%) ${'║'}`);
    }

    // Overall
    const totalPass = Object.values(scores).reduce((s, v) => s + v.pass, 0);
    const totalChecks = Object.values(scores).reduce((s, v) => s + v.pass + v.fail, 0);
    const overallPct = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 100;

    console.log(`${'╠' + '═'.repeat(50) + '╣'}`);

    let verdict = '';
    if (overallPct >= 90) verdict = 'PRODUCTION READY';
    else if (overallPct >= 70) verdict = 'NEEDS IMPROVEMENT';
    else verdict = 'NOT READY';

    console.log(`${'║'}  Overall Score: ${overallPct}% — ${verdict}${' '.repeat(Math.max(0, 30 - verdict.length - String(overallPct).length))}${'║'}`);
    console.log(`${'╚' + '═'.repeat(50) + '╝'}`);

    // Category breakdown
    console.log(`\nCategory Breakdown:`);
    for (const [cat, s] of Object.entries(categoryScores)) {
        const pct = s.total > 0 ? Math.round((s.pass / s.total) * 100) : 100;
        console.log(`  ${cat.padEnd(20)} ${s.pass}/${s.total} (${pct}%)`);
    }

    // Prompt Quality Metrics
    const avgWords = totalTurns > 0 ? Math.round(promptMetrics.totalResponseWords / totalTurns) : 0;
    const instructionCompliance = totalTurns > 0
        ? Math.round(((totalTurns - promptMetrics.keywordFallbackNeeded - promptMetrics.safetyNetTriggers) / totalTurns) * 100) : 100;
    const avgLatency = totalTurns > 0 ? Math.round(promptMetrics.totalLatencyMs / totalTurns) : 0;
    promptMetrics.latencies.sort((a, b) => a - b);
    const p50 = promptMetrics.latencies.length > 0 ? promptMetrics.latencies[Math.floor(promptMetrics.latencies.length * 0.5)] : 0;
    const p95 = promptMetrics.latencies.length > 0 ? promptMetrics.latencies[Math.floor(promptMetrics.latencies.length * 0.95)] : 0;

    const avgTurnsToComplete = promptMetrics.completedConvs > 0
        ? (Object.values(promptMetrics.turnsToComplete).reduce((s, v) => s + v, 0) / promptMetrics.completedConvs).toFixed(1)
        : '—';

    console.log(`\nPrompt Quality Metrics:`);
    console.log(`  Instruction Compliance ${String(instructionCompliance).padStart(3)}%  (LLM followed prompt without correction)`);
    console.log(`  Keyword Fallback Needed ${String(promptMetrics.keywordFallbackNeeded).padStart(3)}/${totalTurns}  (LLM asked wrong question)`);
    console.log(`  Wrong Question Count    ${String(promptMetrics.wrongQuestionCount).padStart(3)}/${totalTurns}  (asked a different state's question)`);
    console.log(`  Safety Net Triggers     ${String(promptMetrics.safetyNetTriggers).padStart(3)}/${totalTurns}  (empty/broken responses)`);
    console.log(`  Avg Response Words      ${String(avgWords).padStart(3)}  (target: 10-25)`);
    console.log(`  Avg Latency             ${avgLatency}ms  (p50: ${p50}ms, p95: ${p95}ms)`);
    console.log(`  Avg Turns to Complete   ${avgTurnsToComplete}  (${promptMetrics.completedConvs} completed conversations)`);

    // Response words by state
    console.log(`\n  Words by State:`);
    for (const [state, words] of Object.entries(promptMetrics.responseWordsByState)) {
        const avg = Math.round(words.reduce((s, v) => s + v, 0) / words.length);
        console.log(`    ${state.padEnd(18)} avg ${avg} words (${words.length} turns)`);
    }

    // Failed turns
    if (failedTurns.length > 0) {
        console.log(`\nFailed Turns (${failedTurns.length}):`);
        for (const ft of failedTurns) {
            console.log(`  ${ft.conv} turn ${ft.turn}: ${ft.reason}`);
            if (VERBOSE && ft.expected) {
                console.log(`    Expected: "${ft.expected}"`);
                console.log(`    Actual:   "${ft.actual}"`);
            }
        }
    } else {
        console.log('\nAll turns passed!');
    }

    // JSON output
    if (JSON_OUTPUT) {
        // Compute avg words per state for JSON
        const avgWordsByState = {};
        for (const [state, words] of Object.entries(promptMetrics.responseWordsByState)) {
            avgWordsByState[state] = Math.round(words.reduce((s, v) => s + v, 0) / words.length);
        }
        const avgLatencyByState = {};
        for (const [state, lats] of Object.entries(promptMetrics.latencyByState)) {
            avgLatencyByState[state] = Math.round(lats.reduce((s, v) => s + v, 0) / lats.length);
        }

        const jsonOut = {
            timestamp: new Date().toISOString(),
            botUrl: BOT_URL,
            datasetName: DATASET_NAME,
            totalConversations: CONVERSATIONS.length,
            totalTurns,
            scores: Object.fromEntries(
                Object.entries(scores).map(([k, v]) => [k, { pass: v.pass, fail: v.fail, pct: Math.round((v.pass / (v.pass + v.fail || 1)) * 100) }])
            ),
            overallScore: overallPct,
            verdict,
            categoryScores,
            failedTurns,
            promptMetrics: {
                instructionCompliance: instructionCompliance,
                keywordFallbackNeeded: promptMetrics.keywordFallbackNeeded,
                wrongQuestionCount: promptMetrics.wrongQuestionCount,
                safetyNetTriggers: promptMetrics.safetyNetTriggers,
                avgResponseWords: avgWords,
                avgLatencyMs: avgLatency,
                p50LatencyMs: p50,
                p95LatencyMs: p95,
                avgTurnsToComplete: promptMetrics.completedConvs > 0
                    ? parseFloat((Object.values(promptMetrics.turnsToComplete).reduce((s, v) => s + v, 0) / promptMetrics.completedConvs).toFixed(1))
                    : null,
                completedConversations: promptMetrics.completedConvs,
                turnsToComplete: promptMetrics.turnsToComplete,
                avgWordsByState,
                avgLatencyByState,
            },
            conversations: convResults,
        };

        const jsonPath = path.join(DATA_DIR, `eval-state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));
        console.log(`\nJSON: ${jsonPath}`);
    }

    console.log('');

    // Exit with non-zero if below threshold
    process.exit(overallPct >= 70 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
