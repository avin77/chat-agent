#!/usr/bin/env node

const {
    buildInFilter,
    fetchSupabaseRows,
    hashPII,
    parseCommonArgs,
    parseJsonField,
    redactText,
    redactObject,
    writeMinedJson,
} = require('./lib/flywheelUtils.js');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule(relativePath) {
    return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function printHelp() {
    console.log(`Usage: node scripts/mine-missed-extractions.js [options]

Options:
  --dry-run           Print the query plan without hitting Supabase
  --limit <n>         Max sessions to inspect per intent (default: 50)
  --out <dir>         Optional output directory path
  --help              Show this help text
`);
}

async function main() {
    const args = parseCommonArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const { AGENTIC_PLAYBOOKS } = await loadModule('src/lib/agentic/playbooks.ts');
    const intents = Object.keys(AGENTIC_PLAYBOOKS);

    if (args.dryRun) {
        console.log(
            JSON.stringify(
                {
                    mode: 'dry-run',
                    script: 'mine-missed-extractions',
                    intentsToProcess: intents,
                    query: {
                        table: 'conversation_sessions',
                        filters: {
                            detected_intent: 'in.(...)',
                            attempts: 'gt.0',
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

    for (const intent of intents) {
        console.log(`Mining missed extractions for intent: ${intent}`);
        
        const sessions = await fetchSupabaseRows({
            table: 'conversation_sessions',
            select: 'conversation_id,current_state,detected_intent,collected_data,attempts,created_at,last_activity',
            filters: {
                detected_intent: `eq.${intent}`,
                attempts: 'gt.0',
            },
            order: 'last_activity.desc',
            limit: args.limit,
        });

        if (sessions.length === 0) {
            console.log(`  No sessions found for ${intent}`);
            continue;
        }

        const conversationIds = sessions
            .map((session) => session.conversation_id)
            .filter(Boolean);
        
        const logs = conversationIds.length > 0
            ? await fetchSupabaseRows({
                table: 'llm_logs',
                select: 'conversation_id,user_message,raw_llm_response,after_guardrails,created_at',
                filters: {
                    conversation_id: buildInFilter(conversationIds),
                    intent: `eq.${intent}`,
                },
                order: 'created_at.asc',
                limit: Math.max(args.limit * 12, 100),
            })
            : [];

        const playbook = AGENTIC_PLAYBOOKS[intent];
        const requiredFields = playbook.requiredFields;

        const processedSessions = sessions.map((session) => {
            const collected = parseJsonField(session.collected_data) || {};
            const pairs = redactObject(logs
                .filter((log) => log.conversation_id === session.conversation_id)
                .slice(-6)
                .map((log, index) => ({
                    turn_index: index + 1,
                    user_message: log.user_message,
                    bot_response: log.after_guardrails || log.raw_llm_response,
                })));

            const fieldSnapshot = {};
            requiredFields.forEach(field => {
                fieldSnapshot[`${field}_present`] = Boolean(collected[field]);
            });

            return {
                intent,
                conversation_id_hash: hashPII(session.conversation_id),
                state: session.current_state || 'UNKNOWN',
                attempts: session.attempts || 0,
                miss_class: (session.attempts || 0) >= 3 ? 'stuck_loop' : 'retry_needed',
                required_snapshot: fieldSnapshot,
                pairs,
            };
        });

        const artifact = {
            generated_at: new Date().toISOString(),
            schema_version: 2,
            source: 'conversation_sessions + llm_logs',
            filters: {
                intent,
                attempts_gt: 0,
                limit: args.limit,
            },
            sessions: processedSessions,
        };

        const target = writeMinedJson(intent, artifact, { out: args.out, prefix: 'missed' });
        console.log(`  Wrote ${processedSessions.length} sessions for ${intent} to ${target}`);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
