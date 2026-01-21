
import { POST } from './src/app/api/chat/route';

// Mock Request class
class MockRequest {
    body: any;
    headersMap: Map<string, string>;

    constructor(body: any, headers: Record<string, string> = {}) {
        this.body = body;
        this.headersMap = new Map(Object.entries(headers));
    }

    async json() {
        return this.body;
    }

    get headers() {
        return {
            get: (key: string) => this.headersMap.get(key.toLowerCase()) || null
        };
    }
}

async function runTest(scenarioName: string, messages: any[]) {
    console.log(`\n--- SCENARIO: ${scenarioName} ---`);
    const req = new MockRequest({
        messages,
        id: 'test-sim-' + Date.now()
    }) as any;

    try {
        const response = await POST(req);
        // creating response stream logic is hard here because POST returns a stream.
        // We might just check if it fails or runs.
        // actually, we can try to read the stream if possible, or just see the logs.
        console.log(`Status: ${response.status}`);

        if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let result = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                result += decoder.decode(value);
            }
            console.log("Response Body (Streamed):", result.slice(0, 200) + "..."); // truncated
        }

    } catch (e) {
        console.error('FAILED:', e);
    }
}

async function main() {
    // 1. Complaint Flow
    await runTest('Complaint - Init', [
        { role: 'user', content: 'I have a complaint about my maid' }
    ]);

    // 2. Complaint - Give Phone (Wait for model to ask, but we simulate next step)
    // Assume bot asked: "What is your phone?"
    await runTest('Complaint - Give Phone', [
        { role: 'user', content: 'I have a complaint' },
        { role: 'assistant', content: 'Please provide your phone number.' },
        { role: 'user', content: '9876543210' }
    ]);

    // 3. Complaint - Give Bad Name/Phone
    await runTest('Complaint - Bad Inputs', [
        { role: 'user', content: 'I have a complaint' },
        { role: 'assistant', content: 'Details?' },
        { role: 'user', content: 'My name is JH and phone is 99999' } // Bad phone
    ]);
}

// Load env first
import * as fs from 'fs';
import * as path from 'path';
try {
    const envPath = path.resolve('.env.local');
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) process.env[k.trim()] = v.trim().replace(/['"]/g, '');
    });
} catch (e) { }

main();
