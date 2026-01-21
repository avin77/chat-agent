
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api/chat';

async function simulateChat(scenarioName: string, messages: any[]) {
    console.log(`\n🔵 SCENARIO: ${scenarioName}`);
    console.log(`Sending ${messages.length} messages...`);

    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, id: 'sim-' + Date.now() })
        });

        if (!response.ok) {
            console.log(`❌ Request failed: ${response.status}`);
            const err = await response.text();
            console.log(err);
            return;
        }

        const text = await response.text();

        // SIMPLE PARSER for AI SDK Stream (v1)
        // It format is: 0:"The text"
        // We will try to extract just the text parts.
        const matches = text.match(/\d+:"(.*?)"/g);
        let readable = "";
        if (matches) {
            readable = matches.map(m => {
                const inner = m.match(/\d+:"(.*?)"/);
                return inner ? inner[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : "";
            }).join("");
        } else {
            readable = text; // Just show raw if regex fails
        }

        console.log(`🤖 RESPONSE:`);
        console.log("---------------------------------------------------");
        console.log(readable.trim());
        console.log("---------------------------------------------------");

        const isDot = readable.trim() === '.' || readable.trim().length === 0;
        if (isDot) {
            console.log(`🚨 FAIL: Received DOT response!`);
        } else {
            if (readable.length < 5) console.warn(`⚠️ Warning: Very short response: ${readable}`);
            else console.log(`✅ Success (Length ${readable.length})`);
        }

    } catch (e) {
        console.error('❌ Network Error:', e);
    }
}

async function run() {
    // 1. Complaint - Correct Data
    await simulateChat("Complaint - Good Data", [
        { role: 'user', content: 'I have a complaint.' },
        { role: 'assistant', content: 'Please share details.' },
        { role: 'user', content: 'My name is John and phone is 9876543210' }
    ]);

    // 2. Maid Hire - Random Name, Wrong Phone
    await simulateChat("Maid Hire - Bad Phone", [
        { role: 'user', content: 'I need a maid.' },
        { role: 'assistant', content: 'Sure, phone number?' },
        { role: 'user', content: 'Name is JJ, phone is 1234' }
    ]);

    // 3. Helper Reg - Random Inputs
    await simulateChat("Helper Reg - Random", [
        { role: 'user', content: 'I want to register as helper.' },
        { role: 'assistant', content: 'Name?' },
        { role: 'user', content: 'My name is X.' }
    ]);

    // 5. ESCALATION TEST
    await simulateChat("Escalation Force", [
        { role: 'user', content: 'I need a maid.' },
        { role: 'assistant', content: 'Sure, phone?' },
        { role: 'user', content: '9876543210' },
        { role: 'assistant', content: 'Name?' },
        { role: 'user', content: 'EscalationUser' }
    ]);
}

run();
