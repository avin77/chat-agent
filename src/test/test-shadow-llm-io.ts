import { mergeLlmIoConversations } from '../app/dashboard/llmIoHelpers';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testMergeLlmIoConversations() {
  const production = [
    {
      conversation_id: 'conv-a',
      detected_intent: 'maid_hire',
      current_state: 'ASK_SERVICE',
      last_activity: '2026-03-10T10:00:00.000Z',
      log_count: 2,
      shadow_count: 0,
      has_production: true,
      has_shadow: false,
    },
  ];

  const shadow = [
    {
      conversation_id: 'conv-a',
      detected_intent: 'maid_hire',
      current_state: 'ASK_SERVICE',
      last_activity: '2026-03-10T10:01:00.000Z',
      log_count: 0,
      shadow_count: 1,
      has_production: false,
      has_shadow: true,
    },
    {
      conversation_id: 'conv-b',
      detected_intent: 'complaint',
      current_state: 'START',
      last_activity: '2026-03-10T09:00:00.000Z',
      log_count: 0,
      shadow_count: 3,
      has_production: false,
      has_shadow: true,
    },
  ];

  const merged = mergeLlmIoConversations(production, shadow);

  assert(merged.length === 2, `Expected 2 merged conversations, got ${merged.length}`);
  assert(merged[0].conversation_id === 'conv-a', 'Expected newest merged conversation first');
  assert(merged[0].has_production === true, 'Expected conv-a to keep production presence');
  assert(merged[0].has_shadow === true, 'Expected conv-a to keep shadow presence');
  assert(merged[0].log_count === 2, `Expected production log count 2, got ${merged[0].log_count}`);
  assert(merged[0].shadow_count === 1, `Expected shadow log count 1, got ${merged[0].shadow_count}`);
  assert(merged[1].conversation_id === 'conv-b', 'Expected conv-b to remain in merged list');
  assert(merged[1].shadow_count === 3, `Expected conv-b shadow count 3, got ${merged[1].shadow_count}`);
}

async function main() {
  console.log('--- Testing LLM I/O shadow conversation merge ---');
  testMergeLlmIoConversations();
  console.log('PASS mergeLlmIoConversations merges production and shadow summaries');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
