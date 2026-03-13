import { extractName } from '../extractors/dataExtractor.ts';
import { runAgenticTurn } from '../lib/agentic/runtime.ts';
import type { AgenticIntentSnapshot } from '../lib/agentic/types.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testHelperRegistrationAliasNormalization() {
  const decision = await runAgenticTurn({
    activeIntent: 'helper_reg',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['helper_reg'],
    runtimeMode: 'live_commit',
    userMessage: 'I want to register as a cook in Whitefield. My number is 9876543210.',
  });

  assert(
    decision.handledIntent === 'maid_registration',
    `Expected handled intent maid_registration, got ${decision.handledIntent}`,
  );
  assert(
    decision.sessionSnapshot.activeIntent === 'maid_registration',
    `Expected session intent maid_registration, got ${decision.sessionSnapshot.activeIntent}`,
  );
}

async function testOutOfOrderSingleSlotCapture() {
  const decision = await runAgenticTurn({
    activeIntent: 'maid_hire',
    currentState: 'ASK_PHONE',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['maid_hire'],
    runtimeMode: 'live_commit',
    userMessage: 'I am in Koramangala.',
  });

  const location = decision.sessionSnapshot.collectedData.location;
  assert(location === 'Koramangala', `Expected Koramangala to be retained, got ${location}`);
  assert(decision.sessionSnapshot.currentState === 'ASK_PHONE', `Expected ASK_PHONE, got ${decision.sessionSnapshot.currentState}`);
  assert(decision.displayText.toLowerCase().includes('mobile number'), 'Expected response to continue asking for phone');
}

function testFalsePositiveNameExtractionRegression() {
  const name = extractName('I am in Koramangala');
  assert(name === null, `Expected null name for location phrase, got ${name}`);
}

async function testComplaintCompletionResumesHireFlow() {
  const suspendedHire: AgenticIntentSnapshot = {
    intent: 'maid_hire',
    currentState: 'ASK_SERVICE',
    collectedData: {
      phone: '9876543210',
      location: 'Koramangala',
    },
    slotAttempts: {},
    repairContext: null,
  };

  const decision = await runAgenticTurn({
    activeIntent: 'complaint',
    currentState: 'ASK_CALLBACK_PREFERENCE',
    collectedData: {
      contact: '9876543210',
      issue_summary: 'The maid was late',
      severity: 'high',
    },
    slotAttempts: {},
    intentStack: [suspendedHire],
    intentHistory: ['maid_hire', 'complaint'],
    runtimeMode: 'live_commit',
    userMessage: 'Please call me back this evening.',
  });


  assert(decision.shouldEscalate === true, 'Expected complaint turn to escalate on completion');
  assert(
    decision.sessionSnapshot.activeIntent === 'maid_hire',
    `Expected flow to resume maid_hire, got ${decision.sessionSnapshot.activeIntent}`,
  );
  assert(
    decision.sessionSnapshot.currentState === 'ASK_SERVICE',
    `Expected resumed state ASK_SERVICE, got ${decision.sessionSnapshot.currentState}`,
  );
  assert(
    decision.displayText.toLowerCase().includes('returning to your maid hire'),
    'Expected response to mention resuming maid hire flow',
  );
}

async function testMixedMessageUpdatesSuspendedParentIntent() {
  const suspendedHire: AgenticIntentSnapshot = {
    intent: 'maid_hire',
    currentState: 'ASK_LOCATION',
    collectedData: {
      phone: '9876543210',
    },
    slotAttempts: {},
    repairContext: null,
  };

  const decision = await runAgenticTurn({
    activeIntent: 'complaint',
    currentState: 'ASK_CONTACT',
    collectedData: {
      issue_summary: 'Your maid was late today',
      severity: 'medium',
    },
    slotAttempts: {},
    intentStack: [suspendedHire],
    intentHistory: ['maid_hire', 'complaint'],
    runtimeMode: 'live_commit',
    userMessage: 'I am in Whitefield and there was an issue with the maid today.',
  });

  const parentSnapshot = decision.sessionSnapshot.intentStack[decision.sessionSnapshot.intentStack.length - 1];
  assert(parentSnapshot?.collectedData.location === 'Whitefield', 'Expected suspended hire flow to retain Whitefield');
}

async function testInvalidPhoneProducesRepair() {
  const decision = await runAgenticTurn({
    activeIntent: 'maid_hire',
    currentState: 'ASK_PHONE',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['maid_hire'],
    runtimeMode: 'live_commit',
    userMessage: 'My number is 12345',
  });

  assert(decision.rejectedSlots.length === 1, `Expected one rejected slot, got ${decision.rejectedSlots.length}`);
  assert(decision.rejectedSlots[0].field === 'phone', `Expected phone rejection, got ${decision.rejectedSlots[0].field}`);
  assert(decision.displayText.toLowerCase().includes('10-digit'), 'Expected repair prompt for valid phone number');
}

async function testShadowAndLiveRuntimeShareContract() {
  const liveDecision = await runAgenticTurn({
    activeIntent: 'maid_hire',
    currentState: 'ASK_PHONE',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['maid_hire'],
    runtimeMode: 'live_commit',
    userMessage: 'My number is 9876543210 and I am in Koramangala.',
  });

  const shadowDecision = await runAgenticTurn({
    activeIntent: 'maid_hire',
    currentState: 'ASK_PHONE',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['maid_hire'],
    runtimeMode: 'shadow_simulate',
    userMessage: 'My number is 9876543210 and I am in Koramangala.',
  });

  assert(
    JSON.stringify(liveDecision.acceptedSlots) === JSON.stringify(shadowDecision.acceptedSlots),
    'Expected live and shadow accepted slots to match',
  );
  assert(
    liveDecision.sessionSnapshot.currentState === shadowDecision.sessionSnapshot.currentState,
    'Expected live and shadow next states to match',
  );
}

async function testGeneralFaqCoverageForNormalEvalCases() {
  const typoFaq = await runAgenticTurn({
    activeIntent: 'general',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['general'],
    runtimeMode: 'live_commit',
    userMessage: 'do u hav cook servise ?',
  });
  assert(
    typoFaq.displayText.toLowerCase().includes('yes') &&
      typoFaq.displayText.toLowerCase().includes('cook'),
    `Expected typo FAQ to confirm cooking service, got "${typoFaq.displayText}"`,
  );

  const wrongCityFaq = await runAgenticTurn({
    activeIntent: 'general',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['general'],
    runtimeMode: 'live_commit',
    userMessage: 'Do you provide service in Mumbai?',
  });
  assert(
    wrongCityFaq.displayText.toLowerCase().includes('bengaluru') &&
      wrongCityFaq.displayText.toLowerCase().includes('only'),
    `Expected wrong-city FAQ to state Bengaluru-only coverage, got "${wrongCityFaq.displayText}"`,
  );

  const verificationFaq = await runAgenticTurn({
    activeIntent: 'general',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['general'],
    runtimeMode: 'live_commit',
    userMessage: 'Are your maids background verified?',
  });
  assert(
    verificationFaq.displayText.toLowerCase().includes('yes') &&
      verificationFaq.displayText.toLowerCase().includes('verified'),
    `Expected verification FAQ to confirm background verification, got "${verificationFaq.displayText}"`,
  );

  const pricingFaq = await runAgenticTurn({
    activeIntent: 'general',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['general'],
    runtimeMode: 'live_commit',
    userMessage: 'What is the salary for a full-time maid?',
  });
  const pricingLower = pricingFaq.displayText.toLowerCase();
  assert(
    pricingLower.includes('team') && pricingLower.includes('call') && pricingLower.includes('discuss'),
    `Expected pricing FAQ to route pricing to the team, got "${pricingFaq.displayText}"`,
  );
}

async function testUpfrontHireMessageStaysInMaidHireFlow() {
  const decision = await runAgenticTurn({
    activeIntent: 'maid_hire',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['maid_hire'],
    runtimeMode: 'live_commit',
    userMessage: 'Need full-time cook in Whitefield. My number is 9123456789',
  });

  assert(decision.handledIntent === 'maid_hire', `Expected maid_hire, got ${decision.handledIntent}`);
  assert(
    decision.sessionSnapshot.currentState === 'COMPLETE',
    `Expected upfront maid_hire details to advance to COMPLETE, got ${decision.sessionSnapshot.currentState}`,
  );
  assert(
    decision.displayText.includes('within 2 hours'),
    `Expected response to confirm callback within 2 hours, got "${decision.displayText}"`,
  );
}

async function testHelperRegistrationMessagingMatchesEvalExpectations() {
  const firstTurn = await runAgenticTurn({
    activeIntent: 'maid_registration',
    currentState: 'START',
    collectedData: {},
    slotAttempts: {},
    intentStack: [],
    intentHistory: ['maid_registration'],
    runtimeMode: 'live_commit',
    userMessage: 'I am looking for work as a cook',
  });

  const firstLower = firstTurn.displayText.toLowerCase();
  assert(
    firstLower.includes('name') && firstLower.includes('number'),
    `Expected helper registration opening to ask for name and number, got "${firstTurn.displayText}"`,
  );

  const secondTurn = await runAgenticTurn({
    activeIntent: 'maid_registration',
    currentState: firstTurn.sessionSnapshot.currentState,
    collectedData: firstTurn.sessionSnapshot.collectedData,
    slotAttempts: firstTurn.sessionSnapshot.slotAttempts,
    intentStack: [],
    intentHistory: firstTurn.sessionSnapshot.intentHistory,
    runtimeMode: 'live_commit',
    userMessage: 'My name is Priya, 9988776655',
  });

  const secondLower = secondTurn.displayText.toLowerCase();
  assert(
    secondLower.includes('priya') &&
      secondLower.includes('registered') &&
      secondLower.includes('work'),
    `Expected helper registration confirmation to mention Priya, registered, and work, got "${secondTurn.displayText}"`,
  );
}

async function main() {
  console.log('--- Testing shared agentic runtime ---');
  testFalsePositiveNameExtractionRegression();
  await testHelperRegistrationAliasNormalization();
  await testOutOfOrderSingleSlotCapture();
  await testComplaintCompletionResumesHireFlow();
  await testMixedMessageUpdatesSuspendedParentIntent();
  await testInvalidPhoneProducesRepair();
  await testShadowAndLiveRuntimeShareContract();
  await testGeneralFaqCoverageForNormalEvalCases();
  await testUpfrontHireMessageStaysInMaidHireFlow();
  await testHelperRegistrationMessagingMatchesEvalExpectations();
  console.log('PASS shared agentic runtime covers normalization, capture, repair, resume, and parity');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
