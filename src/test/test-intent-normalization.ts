// src/test/test-intent-normalization.ts
import { classifyMessage } from '../extractors/intentClassifier';
import { detectIntent } from '../extractors/intentDetector';

async function testIntentNormalization() {
  console.log('--- Testing Intent Normalization ---');

  // Test 1: intentClassifier normalization
  console.log('\n1. Testing intentClassifier.ts:');
  const classifierResult = await classifyMessage('I want to register as a helper', 'START');
  console.log(`Classifier result for "register as a helper": ${classifierResult}`);
  const expectedClassifier = 'maid_registration';
  if (classifierResult !== expectedClassifier) {
    console.error(`❌ FAILED: Expected ${expectedClassifier}, got ${classifierResult}`);
  } else {
    console.log('✅ PASSED: Classifier normalized to maid_registration');
  }

  // Test 2: intentDetector normalization
  console.log('\n2. Testing intentDetector.ts:');
  const detectorResult1 = detectIntent('I want to hire a maid');
  console.log(`Detector result for "hire a maid": ${detectorResult1.intent}`);
  if (detectorResult1.intent !== 'maid_hire') {
    console.error(`❌ FAILED: Expected maid_hire, got ${detectorResult1.intent}`);
  } else {
    console.log('✅ PASSED: Detector normalized to maid_hire');
  }

  const detectorResult2 = detectIntent('I want to register as a maid');
  console.log(`Detector result for "register as a maid": ${detectorResult2.intent}`);
  if (detectorResult2.intent !== 'maid_registration') {
    console.error(`❌ FAILED: Expected maid_registration, got ${detectorResult2.intent}`);
  } else {
    console.log('✅ PASSED: Detector normalized to maid_registration');
  }

  console.log('\n--- Normalization Tests Complete ---');
}

testIntentNormalization().catch(console.error);
