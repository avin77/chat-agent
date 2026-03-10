import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api/chat';
const convoId = 'uat-' + Date.now();

async function sendTurn(content: string, history: any[]) {
    console.log(`\n👤 USER: ${content}`);
    const messages = [...history, { role: 'user', content }];
    
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, id: convoId })
        });

        if (!response.ok) {
            console.log(`❌ Request failed: ${response.status}`);
            return null;
        }

        const text = await response.text();
        const matches = text.match(/\d+:"(.*?)"/g);
        let botText = "";
        if (matches) {
            botText = matches.map(m => {
                const inner = m.match(/\d+:"(.*?)"/);
                // Simple cleanup
                return inner ? inner[1].split('\\n').join('\n').split('\\"').join('"') : "";
            }).join("");
        } else {
            botText = text;
        }

        console.log(`🤖 BOT: ${botText.trim()}`);
        return { role: 'assistant', content: botText.trim() };
    } catch (e) {
        console.error('❌ Error:', e);
        return null;
    }
}

async function runUAT() {
    console.log('🚀 STARTING UAT: Multi-Intent & Confusion Protocol');
    let history: any[] = [];

    // TEST 1: Multi-Intent Switch & Resume
    console.log('\n--- TEST 1: Hire -> Complaint -> Resume Hire ---');
    let turn = await sendTurn('I want to hire a maid', history);
    if (turn) history.push(turn);

    turn = await sendTurn('9876543210', history);
    if (turn) history.push(turn);

    // Switch to complaint
    turn = await sendTurn('Wait, I have a complaint about my previous booking first.', history);
    if (turn) history.push(turn);

    // Finish complaint (it should only need issue details if phone provided)
    turn = await sendTurn('The maid was late and did not clean properly.', history);
    if (turn) history.push(turn);

    // Resume hire
    turn = await sendTurn('Yes, let us continue the hiring.', history);
    if (turn) history.push(turn);

    // TEST 2: Confusion Pivot
    console.log('\n--- TEST 2: Global Confusion Pivot ---');
    // Using a new ID for a fresh session in the second test
    const convoId2 = 'uat-conf-' + Date.now();
    let history2: any[] = [];
    
    // We need to re-define sendTurn locally or pass the ID
    const sendTurn2 = async (content: string, hist: any[]) => {
        console.log(`\n👤 USER: ${content}`);
        const messages = [...hist, { role: 'user', content }];
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, id: convoId2 })
        });
        const text = await response.text();
        const matches = text.match(/\d+:"(.*?)"/g);
        let botText = matches ? matches.map(m => m.match(/\d+:"(.*?)"/)![1].split('\\n').join('\n').split('\\"').join('"')).join("") : text;
        console.log(`🤖 BOT: ${botText.trim()}`);
        return { role: 'assistant', content: botText.trim() };
    };

    let turn2 = await sendTurn2('I need help finding a cook', history2);
    if (turn2) history2.push(turn2);

    turn2 = await sendTurn2('What is your favorite color?', history2);
    if (turn2) history2.push(turn2);

    turn2 = await sendTurn2('Can you play music?', history2);
    if (turn2) history2.push(turn2);

    console.log('\n✅ UAT Simulation Complete.');
}

runUAT();
