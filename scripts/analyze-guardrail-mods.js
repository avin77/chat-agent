#!/usr/bin/env node

const {
    fetchSupabaseRows,
    hashPII,
    parseCommonArgs,
    writeDatedJson,
} = require('./lib/flywheelUtils.js');

function printHelp() {
    console.log(`Usage: node scripts/analyze-guardrail-mods.js [options]

Options:
  --dry-run           Print the query plan without hitting Supabase
  --limit <n>         Max log rows to inspect (default: 50)
  --out <file>        Optional output file path
  --help              Show this help text
`);
}

function deriveState(systemPrompt = '') {
    const match = String(systemPrompt).match(/STATE[:\s]+([A-Z_]+)/);
    return match ? match[1] : 'UNKNOWN';
}

async function main() {
    const args = parseCommonArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    if (args.dryRun) {
        console.log(
            JSON.stringify(
                {
                    mode: 'dry-run',
                    script: 'analyze-guardrail-mods',
                    query: {
                        table: 'llm_logs',
                        filters: {
                            intent: 'eq.maid_hire',
                        },
                        limit: args.limit,
                    },
                },
                null,
                2,
            ),
        );
        return;
    }

    const logs = await fetchSupabaseRows({
        table: 'llm_logs',
        select: 'conversation_id,system_prompt,raw_llm_response,after_guardrails,created_at,intent',
        filters: {
            intent: 'eq.maid_hire',
        },
        order: 'created_at.desc',
        limit: Math.max(args.limit, 100),
    });

    const modified = logs.filter((log) => log.raw_llm_response !== log.after_guardrails);
    const byState = {};

    for (const log of modified) {
        const state = deriveState(log.system_prompt);
        if (!byState[state]) {
            byState[state] = { state, count: 0, conversations: [] };
        }
        byState[state].count += 1;
        byState[state].conversations.push(hashPII(log.conversation_id));
    }

    const artifact = {
        generated_at: new Date().toISOString(),
        schema_version: 1,
        source: 'llm_logs',
        total_logs_analyzed: logs.length,
        total_guardrail_modifications: modified.length,
        by_state: Object.values(byState).sort((left, right) => right.count - left.count),
    };

    const target = writeDatedJson('guardrail-mods', artifact, { out: args.out });
    console.log(`Wrote guardrail analysis to ${target}`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
