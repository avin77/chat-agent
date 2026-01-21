
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

async function debugGemini() {
    const env = loadEnv();
    const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        console.error("❌ Key missing in .env.local");
        return;
    }

    console.log(`Checking key: ${apiKey.substring(0, 5)}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    console.log("Querying available models...");
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            console.log("✅ API Key Works! Writing models to models.json");
            fs.writeFileSync('models.json', JSON.stringify(data, null, 2));
        } else {
            console.error(`❌ API Error: ${response.status} ${response.statusText}`);
        }
    } catch (e) {
        console.error("❌ Network error:", e);
    }
}

debugGemini();
