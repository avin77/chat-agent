import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Manual .env parser
function loadEnv() {
    try {
        const envPath = path.resolve('.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envVars: Record<string, string> = {};

        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                envVars[key] = value;
            }
        });
        return envVars;
    } catch (e) {
        console.error("Could not read .env.local");
        return {};
    }
}

async function verifySupabase() {
    const env = loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('❌ Missing Supabase credentials in .env.local');
        console.log('Found keys:', Object.keys(env));
        return;
    }

    console.log('Testing Supabase connection...');
    console.log(`URL: ${url}`);
    // Hide key in logs
    console.log(`Key: ${key.substring(0, 5)}...`);

    const supabase = createClient(url, key);

    try {
        const { data, error } = await supabase.from('customers').select('count', { count: 'exact', head: true });

        if (error) {
            console.error('❌ Supabase Connection Failed:', error.message);
            if (error.code === 'PGRST301') console.log("Hint: JWT secret or Row Level Security issue.");
            if (error.message.includes("fetch")) console.log("Hint: Network or URL issue.");
        } else {
            console.log('✅ Supabase Connection Successful!');
        }
    } catch (err) {
        console.error('❌ Unexpected Error:', err);
    }
}

verifySupabase();
