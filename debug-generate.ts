
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
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

async function run() {
    const env = loadEnv();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY;

    console.log("Model: gemini-2.0-flash");

    try {
        console.log("Generating text...");
        const result = await generateText({
            model: google('gemini-2.0-flash'),
            prompt: 'Hello',
        });
        console.log("Result:", result.text);
    } catch (error) {
        console.error("Error with gemini-2.0-flash:", error);
    }
}

run();
