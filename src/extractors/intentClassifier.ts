// src/extractors/intentClassifier.ts
// Lightweight LLM classification of user messages mid-flow.
// NEVER throws — classifier errors default to 'unknown'.
// Only called for states between START and COMPLETE.

import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export type MessageCategory =
  | 'expected_slot_answer'
  | 'maid_hire'
  | 'complaint'
  | 'maid_registration'
  | 'meta_question'
  | 'clarification_request'
  | 'off_topic'
  | 'abusive'
  | 'unknown';

const VALID_CATEGORIES: MessageCategory[] = [
  'expected_slot_answer',
  'maid_hire',
  'complaint',
  'maid_registration',
  'meta_question',
  'clarification_request',
  'off_topic',
  'abusive',
  'unknown',
];

export async function classifyMessage(
  userMessage: string,
  currentState: string,
): Promise<MessageCategory> {
  try {
    const { text } = await generateText({
      model: google('gemma-3-27b-it'),
      system: `You are a message classifier for a domestic help booking chatbot.
The bot is currently collecting: ${currentState}.
Classify the user's message into ONE of these categories:
- expected_slot_answer: directly answers what the bot is asking
- clarification_request: asking for more info about the current question
- meta_question: question about the service, pricing, or process
- maid_hire: wants to hire a maid (even if mid-flow)
- maid_registration: wants to register as a helper/maid (even if mid-flow)
- complaint: has a complaint (even if mid-flow)
- off_topic: irrelevant to domestic help (e.g. sports, news)
- abusive: rude, offensive, or threatening
- unknown: unclear

Reply with ONLY the category name. No punctuation. No explanation.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const category = text.trim().toLowerCase() as MessageCategory;
    console.log(`[IntentClassifier] LLM returned: "${text}", cleaned to: "${category}"`);
    return VALID_CATEGORIES.includes(category) ? category : 'unknown';
  } catch (err) {
    console.error(`[IntentClassifier] Error: ${(err as Error).message}`);
    // Classifier errors must never propagate — default to unknown
    return 'unknown';
  }
}
