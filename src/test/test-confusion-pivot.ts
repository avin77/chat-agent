// src/test/test-confusion-pivot.ts
import { MaidHiringFlow } from '../flows/MaidHiringFlow';
import { createSessionState, FlowState } from '../flows/BaseFlow';

// Mock logic from route.ts
function simulateConfusionLogic(session: any, latestMessage: string) {
    const flow = new MaidHiringFlow();
    const currentStep = flow.getStepForState(session.currentState);
    
    // Simulate slot failure
    session.slot_attempts[currentStep!.slotName] = (session.slot_attempts[currentStep!.slotName] || 0) + 1;
    
    const slotFailures = currentStep ? (session.slot_attempts[currentStep.slotName] || 0) : 0;
    const triggerConfusionResponse = slotFailures >= 3;

    if (triggerConfusionResponse) {
        return {
            trigger: true,
            reason: `repeated failures for ${currentStep?.slotName}`,
            instruction: `The user is having trouble. Gently say: "It looks like we're having a bit of trouble..."`
        };
    }
    return { trigger: false };
}

async function testConfusionPivot() {
  console.log('--- Testing Confusion Pivot Logic ---');
  let session = createSessionState('test-convo', 'maid_hire');
  session.currentState = FlowState.ASK_LOCATION;

  console.log('\nFailing location 1st time...');
  let logic = simulateConfusionLogic(session, 'some gibberish');
  console.log(`Triggered: ${logic.trigger}`);

  console.log('\nFailing location 2nd time...');
  logic = simulateConfusionLogic(session, 'more gibberish');
  console.log(`Triggered: ${logic.trigger}`);

  console.log('\nFailing location 3rd time...');
  logic = simulateConfusionLogic(session, 'final gibberish');
  console.log(`Triggered: ${logic.trigger}`);
  
  if (logic.trigger) {
    console.log(`✅ PASSED: Confusion pivot triggered on 3rd failure`);
    // Note: in actual route.ts, it's Reason: repeated failures for location
  } else {
    console.error(`❌ FAILED: Confusion pivot SHOULD have triggered`);
  }

  console.log('\n--- Confusion Pivot Tests Complete ---');
}

testConfusionPivot().catch(console.error);
