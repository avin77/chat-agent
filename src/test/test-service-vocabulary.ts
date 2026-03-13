import { extractWorkType } from '../extractors/dataExtractor.ts';
import { normalizeServicePhrase } from '../lib/serviceVocabulary.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  console.log('--- Testing service vocabulary ---');

  assert(normalizeServicePhrase('Need a cook') === 'Cooking', 'Expected cook to map to Cooking');
  assert(normalizeServicePhrase('bartan aur jhadoo') === 'Cleaning', 'Expected bartan aur jhadoo to map to Cleaning');
  assert(normalizeServicePhrase('khana aur safai') === 'Cooking & Cleaning', 'Expected khana aur safai to map to Cooking & Cleaning');
  assert(normalizeServicePhrase('baccha dekhna') === 'Baby Care', 'Expected baccha phrase to map to Baby Care');
  assert(normalizeServicePhrase('unknown specialised task') === null, 'Expected unsupported phrase to remain null');

  assert(extractWorkType('I need bartan aur jhadoo help') === 'Cleaning', 'Expected extractor to use shared vocabulary for Cleaning');
  assert(extractWorkType('Need cook and clean maid') === 'Cooking & Cleaning', 'Expected extractor to preserve combined mapping');

  console.log('PASS service vocabulary');
}

main();
