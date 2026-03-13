import { applyStrictGuardrails } from '../lib/guardrails.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  console.log('--- Testing guardrail price blocking ---');

  const cleaned = applyStrictGuardrails(
    'Got it, ₹5,000 - ₹6,000 per month. How many family members are in your household?',
  );

  assert(
    !cleaned.includes('₹5') && !cleaned.includes('₹6'),
    `Expected salary echo to be blocked, got "${cleaned}"`,
  );
  assert(
    cleaned.toLowerCase().includes('pricing details') || cleaned.toLowerCase().includes('contact'),
    `Expected replacement text to avoid leaking price, got "${cleaned}"`,
  );

  console.log('PASS guardrail price blocking');
}

main();
