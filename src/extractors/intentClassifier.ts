// src/extractors/intentClassifier.ts
// Lightweight LLM classification of user messages mid-flow.
// NEVER throws — classifier errors default to 'unknown'.
// Only called for states between START and COMPLETE.

import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export type MessageCategory =
  | 'expected_slot_answer'
  | 'new_intent'
  | 'meta_question'
  | 'clarification_request'
  | 'off_topic'
  | 'abusive'
  | 'unknown';

const VALID_CATEGORIES: MessageCategory[] = [
  'expected_slot_answer',
  'new_intent',
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
- new_intent: wants something completely different (e.g. wants to register as helper)
- off_topic: irrelevant to domestic help (e.g. sports, news)
- abusive: rude, offensive, or threatening
- unknown: unclear

Reply with ONLY the category name. No punctuation. No explanation.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const category = text.trim().toLowerCase() as MessageCategory;
    return VALID_CATEGORIES.includes(category) ? category : 'unknown';
  } catch {
    // Classifier errors must never propagate — default to unknown
    return 'unknown';
  }
}
