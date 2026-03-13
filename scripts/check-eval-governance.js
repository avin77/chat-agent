const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function printHelp() {
    console.log(`Usage: node --experimental-strip-types scripts/check-eval-governance.js [options]

Options:
  --json              Print the full governance result as JSON
  --state <file>      Use a specific file for the state track
  --unhappy <file>    Use a specific file for the unhappy track
  --normal <file>     Use a specific file for the normal track
  --help              Show this help text
`);
}

function parseArgs(argv) {
    const parsed = {
        json: false,
        help: false,
        state: null,
        unhappy: null,
        normal: null,
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
        if (arg === '--state' || arg === '--unhappy' || arg === '--normal') {
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

function resolveArtifactPath(fileArg) {
    if (!fileArg) {
        return null;
    }

    return path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
}

function loadArtifactFromFile(filepath) {
    try {
        const payload = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        return {
            filename: path.basename(filepath),
            payload,
        };
    } catch {
        return {
            filename: path.basename(filepath),
            payload: null,
        };
    }
}

function loadArtifactsFromDataDir() {
    const dataDir = path.join(process.cwd(), 'data');
    const allFiles = fs
        .readdirSync(dataDir)
        .filter((file) => file.startsWith('eval-') && file.endsWith('.json'))
        .sort()
        .reverse();

    return allFiles.map((filename) => loadArtifactFromFile(path.join(dataDir, filename)));
}

function printSummary(result) {
    console.log(`Release verdict: ${result.releaseVerdict.toUpperCase()}`);
    console.log('');

    for (const track of result.tracks) {
        const scoreText = track.score === null ? 'missing' : `${track.score}%`;
        console.log(
            `${track.label}: ${track.status.toUpperCase()} | ${scoreText} | floor ${track.minScore}% | ${track.file ?? 'no file'}`,
        );
        for (const reason of track.reasons) {
            console.log(`  - ${reason}`);
        }
    }

    if (result.blockingReasons.length > 0) {
        console.log('');
        console.log('Blocking reasons:');
        for (const reason of result.blockingReasons) {
            console.log(`  - ${reason}`);
        }
    }

    if (result.warningReasons.length > 0) {
        console.log('');
        console.log('Warnings:');
        for (const reason of result.warningReasons) {
            console.log(`  - ${reason}`);
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const governanceModuleUrl = pathToFileURL(
        path.join(process.cwd(), 'src/lib/evalGovernance.ts'),
    ).href;
    const {
        evaluateEvalGovernance,
        selectLatestEvalTrackArtifacts,
    } = await import(governanceModuleUrl);

    let artifacts = [];
    if (args.state || args.unhappy || args.normal) {
        artifacts = ['state', 'unhappy', 'normal']
            .map((track) => {
                const provided = resolveArtifactPath(args[track]);
                return provided ? loadArtifactFromFile(provided) : null;
            })
            .filter(Boolean);
    } else {
        artifacts = loadArtifactsFromDataDir();
    }

    const selected = selectLatestEvalTrackArtifacts(artifacts);
    const result = evaluateEvalGovernance(selected);

    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    printSummary(result);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
