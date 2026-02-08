// Test Runner with Metrics Collection
import { TEST_CASES, TestCase } from './testCases.js';
import { detectIntent } from '../extractors/intentDetector.js';
import { extractAllData } from '../extractors/dataExtractor.js';
import { MaidHiringFlow } from '../flows/MaidHiringFlow.js';
import { HelperRegistrationFlow } from '../flows/HelperRegistrationFlow.js';
import { ComplaintFlow } from '../flows/ComplaintFlow.js';
import { BaseFlow, SessionState } from '../flows/BaseFlow.js';

interface TestResult {
  testId: string;
  scenario: string;
  passed: boolean;
  metrics: {
    intentAccuracy: boolean;
    dataExtractionAccuracy: number; // 0-100%
    flowCompleted: boolean;
    totalMessages: number;
    averageLatency: number; // ms
    stepsCompleted: number;
    totalSteps: number;
  };
  errors: string[];
  extractedData: any;
  conversationLog: Array<{message: string, response: string, latency: number}>;
}

interface DashboardMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  overallAccuracy: number;
  intentDetection: {
    total: number;
    correct: number;
    accuracy: number;
    byIntent: Record<string, {correct: number, total: number, accuracy: number}>;
  };
  dataExtraction: {
    avgAccuracy: number;
    byField: Record<string, {correct: number, total: number, accuracy: number}>;
  };
  flowCompletion: {
    completed: number;
    incomplete: number;
    rate: number;
  };
  performance: {
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
  };
}

function createInitialState(conversationId: string, intent: string): SessionState {
  return {
    conversationId,
    intent,
    currentStep: 0,
    collectedData: {},
    attempts: 0,
    lastMessage: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function getFlowForIntent(intent: string): BaseFlow {
  switch (intent) {
    case 'hire_maid':
      return new MaidHiringFlow();
    case 'helper_registration':
      return new HelperRegistrationFlow();
    case 'complaint':
      return new ComplaintFlow();
    default:
      return new MaidHiringFlow(); // Default
  }
}

function calculateDataExtractionAccuracy(expected: any, extracted: any): number {
  const fields = Object.keys(expected);
  if (fields.length === 0) return 100;

  let correct = 0;
  for (const field of fields) {
    if (expected[field] && extracted[field]) {
      // Normalize for comparison
      const exp = expected[field].toString().toLowerCase().replace(/\s+/g, '');
      const ext = extracted[field].toString().toLowerCase().replace(/\s+/g, '');

      if (exp.includes(ext) || ext.includes(exp)) {
        correct++;
      }
    }
  }

  return (correct / fields.length) * 100;
}

async function simulateLatency(min: number = 50, max: number = 200): Promise<number> {
  const latency = Math.random() * (max - min) + min;
  await new Promise(resolve => setTimeout(resolve, latency));
  return latency;
}

async function runSingleTest(testCase: TestCase): Promise<TestResult> {
  const errors: string[] = [];
  const conversationLog: Array<{message: string, response: string, latency: number}> = [];
  const allExtractedData: any = {};

  // 1. Test Intent Detection
  const firstMessage = testCase.messages[0];
  const startIntent = Date.now();
  const detectedIntentResult = detectIntent(firstMessage);
  const intentLatency = Date.now() - startIntent;

  const intentCorrect = detectedIntentResult.intent === testCase.expectedIntent;
  if (!intentCorrect) {
    errors.push(`Intent mismatch: expected ${testCase.expectedIntent}, got ${detectedIntentResult.intent}`);
  }

  // 2. Initialize Flow
  const flow = getFlowForIntent(detectedIntentResult.intent);
  let state = createInitialState(testCase.id, detectedIntentResult.intent);

  // 3. Process Messages Through Flow
  let flowCompleted = false;
  for (let i = 0; i < testCase.messages.length; i++) {
    const message = testCase.messages[i];

    // Extract data
    const startExtract = Date.now();
    const extracted = extractAllData(message);
    const extractLatency = Date.now() - startExtract;

    // Merge extracted data
    Object.assign(allExtractedData, extracted);

    // Process through flow
    const startFlow = Date.now();
    const result = flow.processMessage(state, message, allExtractedData);
    const flowLatency = Date.now() - startFlow;

    const totalLatency = intentLatency + extractLatency + flowLatency;

    conversationLog.push({
      message,
      response: result.response,
      latency: totalLatency,
    });

    state = result.updatedState;
    flowCompleted = result.isComplete;

    if (flowCompleted) {
      break;
    }
  }

  // 4. Calculate Metrics
  const dataAccuracy = calculateDataExtractionAccuracy(
    testCase.expectedExtraction,
    allExtractedData
  );

  const avgLatency = conversationLog.reduce((sum, log) => sum + log.latency, 0) / conversationLog.length;

  const passed = intentCorrect &&
                 (testCase.shouldComplete === flowCompleted) &&
                 (dataAccuracy >= 80 || Object.keys(testCase.expectedExtraction).length === 0);

  return {
    testId: testCase.id,
    scenario: testCase.scenario,
    passed,
    metrics: {
      intentAccuracy: intentCorrect,
      dataExtractionAccuracy: dataAccuracy,
      flowCompleted,
      totalMessages: testCase.messages.length,
      averageLatency: avgLatency,
      stepsCompleted: state.currentStep,
      totalSteps: flow['steps'].length,
    },
    errors,
    extractedData: allExtractedData,
    conversationLog,
  };
}

export async function runAllTests(): Promise<{results: TestResult[], dashboard: DashboardMetrics}> {
  console.log(`\n🧪 Running ${TEST_CASES.length} test cases...\n`);

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    const result = await runSingleTest(testCase);
    results.push(result);

    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.testId}: ${result.scenario}`);
    if (!result.passed) {
      result.errors.forEach(err => console.log(`   ⚠️  ${err}`));
    }
  }

  // Calculate Dashboard Metrics
  const dashboard = calculateDashboardMetrics(results);

  return { results, dashboard };
}

function calculateDashboardMetrics(results: TestResult[]): DashboardMetrics {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

  // Intent Detection Metrics
  const intentCorrect = results.filter(r => r.metrics.intentAccuracy).length;
  const intentByIntent: Record<string, {correct: number, total: number, accuracy: number}> = {};

  TEST_CASES.forEach((tc, i) => {
    const intent = tc.expectedIntent;
    if (!intentByIntent[intent]) {
      intentByIntent[intent] = { correct: 0, total: 0, accuracy: 0 };
    }
    intentByIntent[intent].total++;
    if (results[i].metrics.intentAccuracy) {
      intentByIntent[intent].correct++;
    }
  });

  Object.keys(intentByIntent).forEach(intent => {
    const data = intentByIntent[intent];
    data.accuracy = (data.correct / data.total) * 100;
  });

  // Data Extraction Metrics
  const avgDataAccuracy = results.reduce((sum, r) => sum + r.metrics.dataExtractionAccuracy, 0) / totalTests;

  const dataByField: Record<string, {correct: number, total: number, accuracy: number}> = {};
  const fields = ['phone', 'name', 'location', 'workType', 'requirements'];

  fields.forEach(field => {
    dataByField[field] = { correct: 0, total: 0, accuracy: 0 };
  });

  TEST_CASES.forEach((tc, i) => {
    const expected = tc.expectedExtraction;
    const extracted = results[i].extractedData;

    fields.forEach(field => {
      const expectedValue = (expected as any)[field];
      const extractedValue = (extracted as any)[field];

      if (expectedValue) {
        dataByField[field].total++;
        if (extractedValue) {
          const exp = expectedValue.toString().toLowerCase();
          const ext = extractedValue.toString().toLowerCase();
          if (exp.includes(ext) || ext.includes(exp)) {
            dataByField[field].correct++;
          }
        }
      }
    });
  });

  Object.keys(dataByField).forEach(field => {
    const data = dataByField[field];
    data.accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
  });

  // Flow Completion
  const completed = results.filter(r => r.metrics.flowCompleted).length;

  // Performance
  const latencies = results.map(r => r.metrics.averageLatency);
  const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);

  return {
    totalTests,
    passedTests,
    failedTests,
    overallAccuracy: (passedTests / totalTests) * 100,
    intentDetection: {
      total: totalTests,
      correct: intentCorrect,
      accuracy: (intentCorrect / totalTests) * 100,
      byIntent: intentByIntent,
    },
    dataExtraction: {
      avgAccuracy: avgDataAccuracy,
      byField: dataByField,
    },
    flowCompletion: {
      completed,
      incomplete: totalTests - completed,
      rate: (completed / totalTests) * 100,
    },
    performance: {
      avgLatency,
      minLatency,
      maxLatency,
    },
  };
}

// Main execution
if (require.main === module) {
  runAllTests().then(({ results, dashboard }) => {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST DASHBOARD');
    console.log('='.repeat(80));
    console.log(`\n🎯 Overall: ${dashboard.passedTests}/${dashboard.totalTests} passed (${dashboard.overallAccuracy.toFixed(1)}%)`);
    console.log(`\n📍 Intent Detection: ${dashboard.intentDetection.accuracy.toFixed(1)}% accurate`);
    Object.entries(dashboard.intentDetection.byIntent).forEach(([intent, data]) => {
      console.log(`   ${intent}: ${data.correct}/${data.total} (${data.accuracy.toFixed(1)}%)`);
    });
    console.log(`\n📦 Data Extraction: ${dashboard.dataExtraction.avgAccuracy.toFixed(1)}% average`);
    Object.entries(dashboard.dataExtraction.byField).forEach(([field, data]) => {
      if (data.total > 0) {
        console.log(`   ${field}: ${data.correct}/${data.total} (${data.accuracy.toFixed(1)}%)`);
      }
    });
    console.log(`\n✅ Flow Completion: ${dashboard.flowCompletion.completed}/${dashboard.totalTests} (${dashboard.flowCompletion.rate.toFixed(1)}%)`);
    console.log(`\n⚡ Performance:`);
    console.log(`   Average Latency: ${dashboard.performance.avgLatency.toFixed(0)}ms`);
    console.log(`   Min: ${dashboard.performance.minLatency.toFixed(0)}ms | Max: ${dashboard.performance.maxLatency.toFixed(0)}ms`);
    console.log('\n' + '='.repeat(80));
  });
}
