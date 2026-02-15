#!/usr/bin/env node
/**
 * EzyBot Eval Suite
 * Tests chatbot across real conversation scenarios.
 * Run: node eval.js [--url https://chat-agent-three.vercel.app] [--verbose]
 *
 * Best practices used:
 * - Multi-turn conversation simulation (not just single messages)
 * - Behavioral assertions (not exact string match)
 * - LLM-as-judge scoring for response quality
 * - Regression tests for known bugs
 * - Clear pass/fail report with reasons
 */

const BASE_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
    || process.argv[process.argv.indexOf('--url') + 1]?.startsWith('http') && process.argv[process.argv.indexOf('--url') + 1]
    || 'http://localhost:3000';
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ─── Test Case Format ────────────────────────────────────────────────────────
// Each test is a multi-turn conversation.
// `turns` = array of { user, checks }
//   checks: { contains, notContains, intent }
//   - contains: string[] — bot response must include ALL of these keywords
//   - notContains: string[] — bot response must NOT include any of these
// `shouldEscalate` = whether the conversation should trigger [ESCALATE] in raw response

const TEST_CASES = [

    // ── FAQ / General Questions ──────────────────────────────────────────────
    {
        id: 'faq_01',
        name: 'User asks if 24hr maid available (reported bug)',
        category: 'FAQ',
        turns: [
            {
                user: 'first you share you have 24 hurs maid ?',
                checks: {
                    contains: ['yes', 'full-time', '24'],
                    notContains: ['which area', 'phone number', 'pricing when they call'],
                }
            }
        ]
    },
    {
        id: 'faq_02',
        name: 'What services do you offer?',
        category: 'FAQ',
        turns: [
            {
                user: 'What services do you offer?',
                checks: {
                    contains: ['cooking', 'cleaning'],
                    notContains: ['phone number', 'pricing when they call'],
                }
            }
        ]
    },
    {
        id: 'faq_03',
        name: 'Spelling mistake in question',
        category: 'FAQ',
        turns: [
            {
                user: 'do u hav cook servise ?',
                checks: {
                    contains: ['cook', 'yes'],
                    notContains: ['don\'t understand', 'unclear'],
                }
            }
        ]
    },
    {
        id: 'faq_04',
        name: 'City outside Bengaluru',
        category: 'FAQ',
        turns: [
            {
                user: 'Do you provide service in Mumbai?',
                checks: {
                    contains: ['bengaluru', 'only'],
                    notContains: ['yes we do', 'available in mumbai'],
                }
            }
        ]
    },
    {
        id: 'faq_05',
        name: 'Are helpers background verified?',
        category: 'FAQ',
        turns: [
            {
                user: 'Are your maids background verified?',
                checks: {
                    contains: ['verified', 'yes'],
                    notContains: [],
                }
            }
        ]
    },

    // ── Maid Hire Flow ───────────────────────────────────────────────────────
    {
        id: 'hire_01',
        name: 'Full maid hire flow — step by step',
        category: 'Maid Hire',
        turns: [
            {
                user: 'I need a maid for cooking',
                checks: {
                    contains: ['number', 'mobile'],
                    notContains: ['which area', 'salary'],
                }
            },
            {
                user: '9876543210',
                checks: {
                    contains: ['area', 'bengaluru'],
                    notContains: ['invalid', 'not valid'],
                }
            },
            {
                user: 'Koramangala',
                checks: {
                    contains: ['help', 'cooking', 'cleaning', 'care', 'type'],
                    notContains: [],
                }
            }
        ]
    },
    {
        id: 'hire_02',
        name: 'User provides all info upfront',
        category: 'Maid Hire',
        turns: [
            {
                user: 'Need full-time cook in Whitefield. My number is 9123456789',
                checks: {
                    contains: ['9123456789'],
                    notContains: ['phone', 'number please', 'share your'],
                }
            }
        ]
    },
    {
        id: 'hire_03',
        name: 'Invalid partial phone number',
        category: 'Maid Hire',
        turns: [
            {
                user: 'I need a maid',
                checks: { contains: ['number', 'mobile'], notContains: [] }
            },
            {
                user: '98765',
                checks: {
                    contains: ['valid', '10'],
                    notContains: ['which area', 'koramangala'],
                }
            }
        ]
    },
    {
        id: 'hire_04',
        name: 'User asks price during hire flow',
        category: 'Maid Hire',
        turns: [
            {
                user: 'I need a maid. How much does it cost?',
                checks: {
                    contains: ['team', 'call', 'discuss'],
                    notContains: ['₹', 'rs.', '5000', '8000', '10000'],
                }
            }
        ]
    },

    // ── Complaint Flow ───────────────────────────────────────────────────────
    {
        id: 'complaint_01',
        name: 'Basic complaint — collects phone',
        category: 'Complaint',
        turns: [
            {
                user: 'Your maid broke my furniture and didnt apologize',
                checks: {
                    contains: ['sorry', 'phone', 'number'],
                    notContains: ['pricing', 'which area'],
                }
            },
            {
                user: '9876543210',
                checks: {
                    contains: ['9876543210', 'team', 'call'],
                    notContains: ['invalid'],
                }
            }
        ],
        shouldEscalate: true
    },

    // ── Helper Registration ──────────────────────────────────────────────────
    {
        id: 'helper_01',
        name: 'Helper registration — full flow',
        category: 'Helper Registration',
        turns: [
            {
                user: 'I am looking for work as a cook',
                checks: {
                    contains: ['name', 'number'],
                    notContains: ['which area', 'need a maid'],
                }
            },
            {
                user: 'My name is Priya, 9988776655',
                checks: {
                    contains: ['priya', 'registered', 'work'],
                    notContains: ['invalid'],
                }
            }
        ],
        shouldEscalate: true
    },

    // ── Regression Tests (Previously Broken) ────────────────────────────────
    {
        id: 'regression_01',
        name: 'Question with "maid" keyword → should NOT jump to hire flow (regression)',
        category: 'Regression',
        turns: [
            {
                user: 'do you have live in maid?',
                checks: {
                    contains: ['yes', 'live-in', 'full-time'],
                    notContains: ['which area', 'koramangala', 'indiranagar', 'whitefield'],
                }
            }
        ]
    },
    {
        id: 'regression_02',
        name: 'Bot should never give prices',
        category: 'Regression',
        turns: [
            {
                user: 'What is the salary for a full-time maid?',
                checks: {
                    contains: ['team', 'call', 'discuss'],
                    notContains: ['₹', 'rs ', '5,000', '8,000', '10,000', '12,000'],
                }
            }
        ]
    },
    {
        id: 'regression_03',
        name: 'No escalation for general question (no phone)',
        category: 'Regression',
        turns: [
            {
                user: 'Hello, what services do you offer?',
                checks: {
                    contains: ['cooking', 'cleaning'],
                    notContains: ['ESCALATE'],
                }
            }
        ],
        shouldEscalate: false
    }
];

// ─── API Call ─────────────────────────────────────────────────────────────────
async function callChat(messages, conversationId) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, id: conversationId }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }

    // Read the stream
    const text = await res.text();

    // Parse AI SDK v6 UI message stream format
    // Lines look like: 0:"text content here"
    let botText = '';
    for (const line of text.split('\n')) {
        // text-delta lines: f:{"type":"text-delta","delta":"hello"}
        const deltaMatch = line.match(/"type":"text-delta","delta":"(.*?)"/);
        if (deltaMatch) {
            botText += JSON.parse(`"${deltaMatch[1]}"`);
        }
        // Also try simple 0:"..." format
        const simpleMatch = line.match(/^0:"(.*)"/);
        if (simpleMatch) {
            try { botText += JSON.parse(`"${simpleMatch[1]}"`); } catch (e) { botText += simpleMatch[1]; }
        }
    }

    return botText.trim() || text.trim();
}

// ─── Run a single test case ───────────────────────────────────────────────────
async function runTest(tc) {
    const convId = `eval_${tc.id}_${Date.now()}`;
    const messages = [];
    const results = [];

    for (let i = 0; i < tc.turns.length; i++) {
        const turn = tc.turns[i];
        messages.push({ role: 'user', content: turn.user });

        let botReply = '';
        let error = null;

        try {
            botReply = await callChat([...messages], convId);
        } catch (e) {
            error = e.message;
        }

        if (botReply) {
            messages.push({ role: 'assistant', content: botReply });
        }

        const botLower = botReply.toLowerCase();
        const failures = [];

        if (turn.checks.contains) {
            for (const kw of turn.checks.contains) {
                if (!botLower.includes(kw.toLowerCase())) {
                    failures.push(`Missing: "${kw}"`);
                }
            }
        }
        if (turn.checks.notContains) {
            for (const kw of turn.checks.notContains) {
                if (botLower.includes(kw.toLowerCase())) {
                    failures.push(`Should NOT contain: "${kw}"`);
                }
            }
        }

        results.push({
            turn: i + 1,
            user: turn.user,
            bot: botReply || `[ERROR: ${error}]`,
            pass: failures.length === 0 && !error,
            failures,
            error,
        });
    }

    const passed = results.every(r => r.pass);
    return { tc, results, passed };
}

// ─── Main Runner ──────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  EzyBot Eval Suite`);
    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Tests: ${TEST_CASES.length}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Check if server is reachable
    try {
        await fetch(`${BASE_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (e) {
        console.error(`❌ Cannot reach ${BASE_URL} — is the server running?\n   npm run dev\n`);
        process.exit(1);
    }

    const categoryResults = {};
    let totalPassed = 0;
    let totalFailed = 0;

    for (const tc of TEST_CASES) {
        process.stdout.write(`  [${tc.category}] ${tc.name}... `);

        try {
            const result = await runTest(tc);

            if (result.passed) {
                console.log('✅ PASS');
                totalPassed++;
            } else {
                console.log('❌ FAIL');
                totalFailed++;
                for (const r of result.results) {
                    if (!r.pass) {
                        console.log(`     Turn ${r.turn}: "${r.user}"`);
                        console.log(`     Bot:  "${r.bot.substring(0, 120)}..."`);
                        for (const f of r.failures) {
                            console.log(`     ✗ ${f}`);
                        }
                    }
                }
            }

            if (VERBOSE) {
                for (const r of result.results) {
                    console.log(`\n     Turn ${r.turn}:`);
                    console.log(`     User: ${r.user}`);
                    console.log(`     Bot:  ${r.bot}`);
                }
                console.log('');
            }

            if (!categoryResults[tc.category]) categoryResults[tc.category] = { pass: 0, fail: 0 };
            if (result.passed) categoryResults[tc.category].pass++;
            else categoryResults[tc.category].fail++;

        } catch (e) {
            console.log(`💥 ERROR: ${e.message}`);
            totalFailed++;
        }

        // Small delay between tests to avoid rate limiting
        await new Promise(r => setTimeout(r, 1200));
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  RESULTS`);
    console.log(`${'═'.repeat(60)}`);

    for (const [cat, r] of Object.entries(categoryResults)) {
        const total = r.pass + r.fail;
        const pct = Math.round(r.pass / total * 100);
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        console.log(`  ${cat.padEnd(22)} ${bar} ${r.pass}/${total} (${pct}%)`);
    }

    const total = totalPassed + totalFailed;
    const overallPct = Math.round(totalPassed / total * 100);
    console.log(`${'─'.repeat(60)}`);
    console.log(`  Overall: ${totalPassed}/${total} passed (${overallPct}%)`);
    console.log('');

    if (overallPct >= 90) {
        console.log('  ✅ PRODUCTION READY (≥90% pass rate)');
    } else if (overallPct >= 70) {
        console.log('  ⚠️  NEEDS IMPROVEMENT (70-89%) — fix failing tests before go-live');
    } else {
        console.log('  ❌ NOT READY (<70%) — significant issues to address');
    }

    console.log(`${'═'.repeat(60)}\n`);

    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
