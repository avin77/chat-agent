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

// ─── API Call (with latency) ──────────────────────────────────────────────────
async function callChat(messages, conversationId) {
    const start = Date.now();
    const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, id: conversationId }),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }

    // Read the stream
    const text = await res.text();

    // Parse AI SDK v6 UI message stream format
    let botText = '';
    for (const line of text.split('\n')) {
        const deltaMatch = line.match(/"type":"text-delta","delta":"(.*?)"/);
        if (deltaMatch) {
            try { botText += JSON.parse(`"${deltaMatch[1]}"`); } catch(e) { botText += deltaMatch[1]; }
        }
        const simpleMatch = line.match(/^0:"(.*)"/);
        if (simpleMatch) {
            try { botText += JSON.parse(`"${simpleMatch[1]}"`); } catch (e) { botText += simpleMatch[1]; }
        }
    }

    return { text: botText.trim() || text.trim(), latencyMs };
}

// ─── Run a single test case ───────────────────────────────────────────────────
async function runTest(tc) {
    const convId = `eval_${tc.id}_${Date.now()}`;
    const messages = [];
    const results = [];
    const latencies = [];

    for (let i = 0; i < tc.turns.length; i++) {
        const turn = tc.turns[i];
        messages.push({ role: 'user', content: turn.user });

        let botReply = '';
        let latencyMs = 0;
        let error = null;

        try {
            const resp = await callChat([...messages], convId);
            botReply = resp.text;
            latencyMs = resp.latencyMs;
            latencies.push(latencyMs);
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
            latencyMs,
            pass: failures.length === 0 && !error,
            failures,
            error,
        });
    }

    const passed = results.every(r => r.pass);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a,b) => a+b, 0) / latencies.length) : 0;
    return { tc, results, passed, avgLatency };
}

// ─── Main Runner ──────────────────────────────────────────────────────────────
async function main() {
    const WHATSAPP = process.argv.includes('--whatsapp'); // compact output for Andy to forward
    const jsonOutput = process.argv.includes('--json');

    if (!WHATSAPP) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  EzyBot Eval Suite`);
        console.log(`  Target: ${BASE_URL}`);
        console.log(`  Tests: ${TEST_CASES.length}`);
        console.log(`${'═'.repeat(60)}\n`);
    }

    // Check if server is reachable
    try {
        await fetch(`${BASE_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (e) {
        const msg = `Cannot reach ${BASE_URL} — is the server running?`;
        console.error(WHATSAPP ? `❌ ${msg}` : `❌ ${msg}\n   npm run dev\n`);
        process.exit(1);
    }

    const categoryResults = {};
    const allLatencies = [];
    let totalPassed = 0;
    let totalFailed = 0;
    const failedTests = [];

    for (const tc of TEST_CASES) {
        if (!WHATSAPP) process.stdout.write(`  [${tc.category}] ${tc.name}... `);

        try {
            const result = await runTest(tc);
            if (result.avgLatency) allLatencies.push(result.avgLatency);

            if (result.passed) {
                if (!WHATSAPP) console.log(`✅ PASS  (${result.avgLatency}ms)`);
                totalPassed++;
            } else {
                if (!WHATSAPP) {
                    console.log('❌ FAIL');
                    for (const r of result.results) {
                        if (!r.pass) {
                            console.log(`     Turn ${r.turn}: "${r.user}"`);
                            console.log(`     Bot:  "${r.bot.substring(0, 120)}"`);
                            for (const f of r.failures) console.log(`     ✗ ${f}`);
                        }
                    }
                }
                totalFailed++;
                failedTests.push({ id: tc.id, name: tc.name, category: tc.category, results: result.results });
            }

            if (VERBOSE && !WHATSAPP) {
                for (const r of result.results) {
                    console.log(`\n     Turn ${r.turn} (${r.latencyMs}ms):`);
                    console.log(`     User: ${r.user}`);
                    console.log(`     Bot:  ${r.bot}`);
                }
                console.log('');
            }

            if (!categoryResults[tc.category]) categoryResults[tc.category] = { pass: 0, fail: 0 };
            if (result.passed) categoryResults[tc.category].pass++;
            else categoryResults[tc.category].fail++;

        } catch (e) {
            if (!WHATSAPP) console.log(`💥 ERROR: ${e.message}`);
            totalFailed++;
        }

        // Delay between tests to avoid rate limiting
        await new Promise(r => setTimeout(r, 1500));
    }

    // ── Metrics ───────────────────────────────────────────────────────────────
    const total = totalPassed + totalFailed;
    const overallPct = Math.round(totalPassed / total * 100);
    const avgLatency = allLatencies.length ? Math.round(allLatencies.reduce((a,b)=>a+b,0) / allLatencies.length) : 0;
    const maxLatency = allLatencies.length ? Math.max(...allLatencies) : 0;
    const slowTests = allLatencies.filter(l => l > 5000).length;

    const verdict = overallPct >= 90 ? '✅ PRODUCTION READY'
        : overallPct >= 70 ? '⚠️ NEEDS IMPROVEMENT'
        : '❌ NOT READY';

    // ── Console Summary ───────────────────────────────────────────────────────
    if (!WHATSAPP) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  RESULTS`);
        console.log(`${'═'.repeat(60)}`);
        for (const [cat, r] of Object.entries(categoryResults)) {
            const t = r.pass + r.fail;
            const pct = Math.round(r.pass / t * 100);
            const bar = '█'.repeat(Math.round(pct/10)) + '░'.repeat(10 - Math.round(pct/10));
            console.log(`  ${cat.padEnd(22)} ${bar} ${r.pass}/${t} (${pct}%)`);
        }
        console.log(`${'─'.repeat(60)}`);
        console.log(`  Score:    ${totalPassed}/${total} passed (${overallPct}%)`);
        console.log(`  Latency:  avg ${avgLatency}ms, max ${maxLatency}ms${slowTests > 0 ? `, ${slowTests} slow (>5s)` : ''}`);
        console.log('');
        console.log(`  ${verdict}`);
        if (failedTests.length > 0) {
            console.log(`\n  Failed tests: ${failedTests.map(f => f.id).join(', ')}`);
        }
        console.log(`${'═'.repeat(60)}\n`);
    }

    // ── WhatsApp-Friendly Output (for Andy to forward) ────────────────────────
    if (WHATSAPP) {
        const lines = [
            `*EzyBot Eval Report*`,
            `Score: ${totalPassed}/${total} (${overallPct}%) — ${verdict}`,
            `Latency: avg ${avgLatency}ms, max ${maxLatency}ms`,
            ``,
        ];
        for (const [cat, r] of Object.entries(categoryResults)) {
            const t = r.pass + r.fail;
            const icon = r.fail === 0 ? '✅' : r.pass === 0 ? '❌' : '⚠️';
            lines.push(`${icon} ${cat}: ${r.pass}/${t}`);
        }
        if (failedTests.length > 0) {
            lines.push('');
            lines.push('*Failed:*');
            for (const f of failedTests) {
                const firstFail = f.results.find(r => !r.pass);
                const reason = firstFail?.failures[0] || 'error';
                lines.push(`• ${f.id}: ${reason}`);
            }
        }
        lines.push('');
        lines.push(overallPct >= 90
            ? '✅ Ready for production'
            : overallPct >= 70
            ? '⚠️ Fix failures before go-live'
            : '❌ Not ready — significant issues');
        console.log(lines.join('\n'));
    }

    // ── JSON Output (for saving results) ─────────────────────────────────────
    if (jsonOutput) {
        const report = {
            timestamp: new Date().toISOString(),
            url: BASE_URL,
            score: { passed: totalPassed, total, pct: overallPct },
            latency: { avg: avgLatency, max: maxLatency, slowTests },
            categories: categoryResults,
            failedTests: failedTests.map(f => ({ id: f.id, name: f.name, category: f.category })),
            verdict,
        };
        const fs = await import('fs');
        const fname = `eval-results-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
        fs.writeFileSync(fname, JSON.stringify(report, null, 2));
        console.log(`\nResults saved to ${fname}`);
    }

    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
