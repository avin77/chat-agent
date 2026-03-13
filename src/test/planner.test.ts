import { AgentPlanner } from '../lib/agentic/planner.ts';
import type { PlannerContext } from '../lib/agentic/types.ts';
import * as fs from 'fs';
import * as path from 'path';

// Load env
try {
    const envPath = path.resolve('.env.local');
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) {
            const val = v.trim().replace(/['"]/g, '');
            process.env[k.trim()] = val;
        }
    });
} catch (e) { }

async function testPlannerReal() {
  console.log('Testing: Planner with REAL model...');
  
  const planner = new AgentPlanner();
  const context: PlannerContext = {
    activeIntent: 'maid_hire',
    currentState: 'ASK_PHONE',
    collectedData: {},
    history: [
      { role: 'user', content: 'I need a maid. My number is 9876543210.' }
    ],
  };

  const plan = await planner.createPlan(context);
  console.log('Plan received:', plan);
  
  if (plan.confidence > 50 && plan.reflection) {
    console.log('✅ PASS: Planner returned a valid plan.');
  } else {
    console.error('❌ FAIL: Planner returned invalid plan.', plan);
    process.exit(1);
  }
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.warn('Skipping real model test (no API key).');
    return;
  }
  await testPlannerReal();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
