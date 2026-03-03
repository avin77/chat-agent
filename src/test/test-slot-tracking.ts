// src/test/test-slot-tracking.ts
import { MaidHiringFlow } from '../flows/MaidHiringFlow';
import { createSessionState, FlowState } from '../flows/BaseFlow';

async function testSlotTracking() {
  console.log('--- Testing Slot Frustration Tracking ---');
  const flow = new MaidHiringFlow();
  let session = createSessionState('test-convo', 'maid_hire');
  
  // Start at ASK_PHONE
  session.currentState = FlowState.ASK_PHONE;
  console.log(`Initial slot_attempts: ${JSON.stringify(session.slot_attempts)}`);

  // Turn 1: Invalid phone
  console.log('\nTurn 1: Invalid phone "123"');
  let result = flow.processMessage(session, '123', { phone: null }, null, null, false, null);
  session.slot_attempts = result.slot_attempts;
  console.log(`Result slot_attempts: ${JSON.stringify(session.slot_attempts)}`);
  
  if (session.slot_attempts.phone !== 1) {
    console.error('❌ FAILED: phone attempts should be 1');
  } else {
    console.log('✅ PASSED: phone attempts is 1');
  }

  // Turn 2: Another invalid phone
  console.log('\nTurn 2: Invalid phone "abc"');
  result = flow.processMessage(session, 'abc', { phone: null }, null, null, false, null);
  session.slot_attempts = result.slot_attempts;
  console.log(`Result slot_attempts: ${JSON.stringify(session.slot_attempts)}`);

  if (session.slot_attempts.phone !== 2) {
    console.error('❌ FAILED: phone attempts should be 2');
  } else {
    console.log('✅ PASSED: phone attempts is 2');
  }

  // Turn 3: Valid phone
  console.log('\nTurn 3: Valid phone "9876543210"');
  result = flow.processMessage(session, '9876543210', { phone: '9876543210' }, null, null, false, null);
  session.slot_attempts = result.slot_attempts;
  console.log(`Result slot_attempts after success: ${JSON.stringify(session.slot_attempts)}`);

  if (session.slot_attempts.phone) {
    console.error('❌ FAILED: phone attempts should be reset/deleted');
  } else {
    console.log('✅ PASSED: phone attempts reset on success');
  }

  console.log('\n--- Slot Tracking Tests Complete ---');
}

testSlotTracking().catch(console.error);
