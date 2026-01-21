
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

async function verifyGemini() {
    const env = loadEnv();
    const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        console.error("❌ GOOGLE_GENERATIVE_AI_API_KEY not found in .env.local");
        return;
    }

    console.log(`Testing Gemini API Key: ${apiKey.substring(0, 5)}...`);

    const models = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-1.5-pro',
        'gemini-pro',
        'gemini-1.0-pro'
    ];

    for (const model of models) {
        console.log(`\nTesting Model: ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: "Hello" }]
                    }]
                })
            });

            if (response.ok) {
                console.log(`✅ Success! Model '${model}' is working.`);
                // return; // Continue testing all
            } else {
                console.log(`❌ Failed '${model}': ${response.status} ${response.statusText}`);
                if (response.status === 404) {
                    // console.log("Model not found or not available for this key.");
                } else {
                    const error = await response.text();
                    console.log("Error details:", error);
                }
            }
        } catch (error) {
            console.error("❌ Network Error:", error);
        }
    }
}

verifyGemini();
