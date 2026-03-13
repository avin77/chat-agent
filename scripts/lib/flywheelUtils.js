const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseCommonArgs(argv) {
    const parsed = {
        help: false,
        dryRun: false,
        limit: 50,
        out: null,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help' || arg === '-h') {
            parsed.help = true;
            continue;
        }
        if (arg === '--dry-run') {
            parsed.dryRun = true;
            continue;
        }
        if (arg === '--limit' || arg === '--out') {
            const nextValue = argv[index + 1];
            if (!nextValue) {
                throw new Error(`Missing value for ${arg}`);
            }
            if (arg === '--limit') {
                parsed.limit = Number.parseInt(nextValue, 10);
            } else {
                parsed.out = nextValue;
            }
            index += 1;
            continue;
        }
        if (arg.startsWith('--limit=')) {
            parsed.limit = Number.parseInt(arg.split('=')[1], 10);
            continue;
        }
        if (arg.startsWith('--out=')) {
            parsed.out = arg.split('=')[1];
        }
    }

    if (!Number.isFinite(parsed.limit) || parsed.limit <= 0) {
        parsed.limit = 50;
    }

    return parsed;
}

function loadSupabaseEnv() {
    let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

    if (supabaseUrl && supabaseKey) {
        return { supabaseUrl, supabaseKey };
    }

    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) {
        return { supabaseUrl, supabaseKey };
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split(/\r?\n/)) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (!match) {
            continue;
        }
        const key = match[1].trim();
        const value = match[2].trim();
        if (!supabaseUrl && key === 'NEXT_PUBLIC_SUPABASE_URL') {
            supabaseUrl = value;
        }
        if (!supabaseKey && key === 'SUPABASE_SERVICE_ROLE_KEY') {
            supabaseKey = value;
        }
    }

    return { supabaseUrl, supabaseKey };
}

function ensureSupabaseEnv() {
    const env = loadSupabaseEnv();
    if (!env.supabaseUrl || !env.supabaseKey) {
        throw new Error(
            'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or add them to .env.local.',
        );
    }
    return env;
}

function hashPII(value) {
    return crypto
        .createHash('sha256')
        .update(String(value))
        .digest('hex')
        .slice(0, 12);
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const NAME_PATTERNS = [
    /my name is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi,
    /i am ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi,
    /this is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi,
];

function redactText(text, replacement = '[REDACTED]') {
    if (!text) {
        return '';
    }

    let scrubbed = String(text);
    scrubbed = scrubbed.replace(EMAIL_REGEX, replacement);
    scrubbed = scrubbed.replace(PHONE_REGEX, replacement);

    for (const pattern of NAME_PATTERNS) {
        scrubbed = scrubbed.replace(pattern, (match, p1) => {
            return match.replace(p1, replacement);
        });
    }

    return scrubbed;
}

function redactObject(obj, replacement = '[REDACTED]') {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        return redactText(obj, replacement);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => redactObject(item, replacement));
    }

    if (typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = redactObject(obj[key], replacement);
            }
        }
        return newObj;
    }

    return obj;
}

function buildDatedFilename(prefix, now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    return `${prefix}-${date}.json`;
}

function resolveMinedPath(intent, out = null) {
    if (out) {
        return path.isAbsolute(out) ? out : path.join(process.cwd(), out);
    }
    return path.join(process.cwd(), 'data', 'mined', intent);
}

function writeDatedJson(prefix, payload, options = {}) {
    const explicitOut = options.out || null;
    const targetPath = explicitOut
        ? (path.isAbsolute(explicitOut) ? explicitOut : path.join(process.cwd(), explicitOut))
        : path.join(process.cwd(), 'data', buildDatedFilename(prefix));

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
    return targetPath;
}

function writeMinedJson(intent, payload, options = {}) {
    const prefix = options.prefix || 'golden';
    const targetDir = resolveMinedPath(intent, options.out);
    const filename = buildDatedFilename(prefix);
    const targetPath = path.join(targetDir, filename);

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
    return targetPath;
}

function parseJsonField(value) {
    if (value == null) {
        return null;
    }
    if (typeof value === 'object') {
        return value;
    }
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function buildInFilter(values) {
    return `in.(${values.map((value) => `"${String(value).replace(/"/g, '')}"`).join(',')})`;
}

async function fetchSupabaseRows({ table, select, filters = {}, limit, order }) {
    const { supabaseUrl, supabaseKey } = ensureSupabaseEnv();
    const endpoint = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`);
    endpoint.searchParams.set('select', select);

    for (const [key, value] of Object.entries(filters)) {
        endpoint.searchParams.set(key, value);
    }
    if (typeof limit === 'number') {
        endpoint.searchParams.set('limit', String(limit));
    }
    if (order) {
        endpoint.searchParams.set('order', order);
    }

    const response = await fetch(endpoint, {
        headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Supabase query failed (${response.status}): ${await response.text()}`);
    }

    return response.json();
}

module.exports = {
    buildInFilter,
    fetchSupabaseRows,
    hashPII,
    loadSupabaseEnv,
    parseCommonArgs,
    parseJsonField,
    redactText,
    redactObject,
    writeDatedJson,
    writeMinedJson,
    resolveMinedPath,
};
