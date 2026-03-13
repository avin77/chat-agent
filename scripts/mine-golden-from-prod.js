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
    console.log(`Usage: node scripts/mine-golden-from-prod.js [options]

Options:
  --dry-run           Print the query plan without hitting Supabase
  --limit <n>         Max complete sessions to mine per intent (default: 50)
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
                    script: 'mine-golden-from-prod',
                    intentsToProcess: intents,
                    query: {
                        table: 'conversation_sessions',
                        filters: {
                            detected_intent: 'in.(...)',
                            current_state: 'eq.COMPLETE',
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
        console.log(`Mining golden sessions for intent: ${intent}`);
        
        const sessions = await fetchSupabaseRows({
            table: 'conversation_sessions',
            select: 'conversation_id,current_state,collected_data,created_at,last_activity',
            filters: {
                detected_intent: `eq.${intent}`,
                current_state: 'eq.COMPLETE',
            },
            order: 'last_activity.desc',
            limit: args.limit,
        });

        if (sessions.length === 0) {
            console.log(`  No COMPLETE sessions found for ${intent}`);
            continue;
        }

        const conversationIds = sessions
            .map((session) => session.conversation_id)
            .filter(Boolean);
            
        const logs = conversationIds.length > 0
            ? await fetchSupabaseRows({
                table: 'llm_logs',
                select: 'conversation_id,user_message,after_guardrails,created_at',
                filters: {
                    conversation_id: buildInFilter(conversationIds),
                    intent: `eq.${intent}`,
                },
                order: 'created_at.asc',
                limit: Math.max(args.limit * 16, 120),
            })
            : [];

        const playbook = AGENTIC_PLAYBOOKS[intent];
        const supportedFields = playbook.supportedFields || [];

        const conversations = sessions.map((session) => {
            const collected = parseJsonField(session.collected_data) || {};
            
            const slotSnapshot = {};
            supportedFields.forEach(field => {
                slotSnapshot[field] = collected[field] || null;
            });

            return {
                id: `mined_${hashPII(session.conversation_id)}`,
                source_session: hashPII(session.conversation_id),
                category: 'prod_mined_complete',
                notes: `PII-redacted production candidate mined from COMPLETE ${intent} session.`,
                slot_snapshot: redactObject(slotSnapshot),
                turns: logs
                    .filter((log) => log.conversation_id === session.conversation_id)
                    .map((log) => ({
                        user: redactText(log.user_message),
                        bot: redactText(log.after_guardrails),
                    })),
            };
        });

        const artifact = {
            generated_at: new Date().toISOString(),
            schema_version: 1,
            source: 'conversation_sessions + llm_logs',
            filters: {
                detected_intent: intent,
                current_state: 'COMPLETE',
                limit: args.limit,
            },
            conversations,
        };

        const target = writeMinedJson(intent, artifact, { out: args.out });
        console.log(`  Wrote ${conversations.length} mined conversations to ${target}`);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
