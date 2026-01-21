
import { extractName, validatePhone } from './src/lib/guardrails';

const testCases = [
    { name: 'Standard Name', input: 'My name is John Doe', expected: 'John Doe' },
    { name: 'Short Name', input: 'I am JH', expected: 'JH' },
    { name: 'Lowercase Name', input: 'name is ph', expected: 'ph' },
    { name: 'Name with Phone', input: 'John 9876543210', expected: 'John' },
    { name: 'Just Name', input: 'Alice', expected: 'Alice' },
];

console.log('--- TEST: Name Extraction ---');
testCases.forEach(t => {
    const result = extractName(t.input);
    const status = result?.toLowerCase() === t.expected.toLowerCase() ? '✅' : '❌';
    console.log(`${status} [${t.name}] Input: "${t.input}" -> Got: "${result}" (Expected: "${t.expected}")`);
});

const phoneCases = [
    { input: '9876543210', valid: true },
    { input: 'My phone is 9876543210', valid: true },
    { input: '12345', valid: false }, // Short
    { input: '999999999', valid: false }, // 9 digits
    { input: '99999 99999', valid: false }, // Space (current regex might fail)
];

console.log('\n--- TEST: Phone Validation ---');
phoneCases.forEach(t => {
    const res = validatePhone(t.input);
    const isValid = !!res;
    const status = isValid === t.valid ? '✅' : '❌';
    console.log(`${status} Input: "${t.input}" -> Valid: ${isValid} (Extracted: ${res})`);
});
