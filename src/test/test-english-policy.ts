// src/test/test-english-policy.ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

// We'll simulate the system prompt with the English policy added
const SYSTEM_PROMPT = `ROLE: EzyBot — domestic help intake assistant for EzyHelpers.com, Bengaluru.
LANGUAGE_POLICY: Respond ONLY in English. Even if the user speaks Hinglish or another language, clarify that you only speak English and continue the task.
INSTRUCTION: Ask: Please share your 10-digit mobile number.`;

async function testEnglishPolicy() {
  console.log('--- Testing English-Only Policy ---');

  const { text } = await generateText({
    model: google('gemma-3-2b-it'), // Using lite model for test
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: 'Kya aap Hindi bol sakte hain? Mujhe ek maid chahiye.' }],
  });

  console.log(`User: Kya aap Hindi bol sakte hain? Mujhe ek maid chahiye.`);
  console.log(`Bot: ${text}`);

  // Validation: Response should NOT contain Hindi characters and should be in English
  const containsHindi = /[\u0900-\u097F]/.test(text);
  if (containsHindi) {
    console.error('❌ FAILED: Bot responded in Hindi');
  } else if (text.toLowerCase().includes('hindi') || text.toLowerCase().includes('english')) {
    console.log('✅ PASSED: Bot followed language policy (clarified or stayed in English)');
  } else {
    console.log('✅ PASSED: Bot responded in English');
  }
}

testEnglishPolicy().catch(console.error);
