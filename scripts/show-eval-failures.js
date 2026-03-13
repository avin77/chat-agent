#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function printHelp() {
    console.log(`Usage: node scripts/show-eval-failures.js [options]

Options:
  --file <path>       Read a specific eval result file
  --category <name>   Filter failures by category
  --conv <id>         Filter failures by conversation id
  --blocker <token>   Filter by blocker token (conversation id or category)
  --json              Print filtered failures as JSON
  --help              Show this help text
`);
}

function parseArgs(argv) {
    const parsed = {
        file: null,
        category: null,
        conv: null,
        blocker: null,
        json: false,
        help: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--json') {
            parsed.json = true;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            parsed.help = true;
            continue;
        }
        if (arg === '--file' || arg === '--category' || arg === '--conv' || arg === '--blocker') {
            const nextValue = argv[index + 1];
            if (!nextValue) {
                throw new Error(`Missing value for ${arg}`);
            }
            parsed[arg.slice(2)] = nextValue;
            index += 1;
        }
    }

    return parsed;
}

function resolveEvalFile(fileArg) {
    if (fileArg) {
        return path.isAbsolute(fileArg)
            ? fileArg
            : path.join(process.cwd(), fileArg);
    }

    const dataDir = path.join(process.cwd(), 'data');
    const latest = fs
        .readdirSync(dataDir)
        .filter((file) => file.startsWith('eval-') && file.endsWith('.json'))
        .sort()
        .reverse()[0];

    if (!latest) {
        throw new Error('No eval JSON files found in data/');
    }

    return path.join(dataDir, latest);
}

function flattenFailures(report) {
    const categoryByConversation = new Map(
        (report.conversations || []).map((conversation) => [conversation.id, conversation.category]),
    );

    return (report.failedTurns || []).map((failure) => ({
        conv: failure.conv,
        category: categoryByConversation.get(failure.conv) || 'unknown',
        turn: failure.turn,
        reason: failure.reason,
        user: failure.user || null,
        actual: failure.actual || null,
        expected: failure.expected || null,
    }));
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const filePath = resolveEvalFile(args.file);
    const report = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let failures = flattenFailures(report);
    if (args.category) {
        failures = failures.filter((failure) => failure.category === args.category);
    }
    if (args.conv) {
        failures = failures.filter((failure) => failure.conv === args.conv);
    }
    if (args.blocker) {
        failures = failures.filter(
            (failure) =>
                failure.conv === args.blocker || failure.category === args.blocker,
        );
    }

    if (args.json) {
        console.log(
            JSON.stringify(
                {
                    file: path.basename(filePath),
                    totalFailures: failures.length,
                    failures,
                },
                null,
                2,
            ),
        );
        return;
    }

    console.log(`File: ${path.basename(filePath)}`);
    console.log(`Failures: ${failures.length}`);
    if (failures.length === 0) {
        return;
    }

    const grouped = failures.reduce((accumulator, failure) => {
        accumulator[failure.category] = (accumulator[failure.category] || 0) + 1;
        return accumulator;
    }, {});

    console.log('\nBy category:');
    Object.entries(grouped)
        .sort((left, right) => right[1] - left[1])
        .forEach(([category, count]) => {
            console.log(`  - ${category}: ${count}`);
        });

    console.log('\nDetails:');
    for (const failure of failures) {
        console.log(
            `  - ${failure.conv} t${failure.turn} [${failure.category}] ${failure.reason}`,
        );
    }
}

main();
