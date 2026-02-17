// Test Runner with Metrics Collection
// NOTE: This test runner tests the extractors and intent detector independently.
// For full state machine eval, use: npm run eval:state
import { TEST_CASES, TestCase } from './testCases.js';
import { detectIntent } from '../extractors/intentDetector.js';
import { extractAllData } from '../extractors/dataExtractor.js';

interface TestResult {
  testId: string;
  scenario: string;
  passed: boolean;
  metrics: {
    intentAccuracy: boolean;
    dataExtractionAccuracy: number;
    totalMessages: number;
    averageLatency: number;
  };
  errors: string[];
  extractedData: any;
  conversationLog: Array<{message: string, latency: number}>;
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
  performance: {
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
  };
}

function calculateDataExtractionAccuracy(expected: any, extracted: any): number {
  const fields = Object.keys(expected);
  if (fields.length === 0) return 100;

  let correct = 0;
  for (const field of fields) {
    if (expected[field] && extracted[field]) {
      const exp = expected[field].toString().toLowerCase().replace(/\s+/g, '');
      const ext = extracted[field].toString().toLowerCase().replace(/\s+/g, '');

      if (exp.includes(ext) || ext.includes(exp)) {
        correct++;
      }
    }
  }

  return (correct / fields.length) * 100;
}

async function runSingleTest(testCase: TestCase): Promise<TestResult> {
  const errors: string[] = [];
  const conversationLog: Array<{message: string, latency: number}> = [];
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

  // 2. Process Messages — extract data from each
  for (let i = 0; i < testCase.messages.length; i++) {
    const message = testCase.messages[i];

    const startExtract = Date.now();
    const extracted = extractAllData(message);
    const extractLatency = Date.now() - startExtract;

    // Merge extracted data
    for (const [key, value] of Object.entries(extracted)) {
      if (value) allExtractedData[key] = value;
    }

    conversationLog.push({ message, latency: intentLatency + extractLatency });
  }

  // 3. Calculate Metrics
  const dataAccuracy = calculateDataExtractionAccuracy(
    testCase.expectedExtraction,
    allExtractedData
  );

  const avgLatency = conversationLog.reduce((sum, log) => sum + log.latency, 0) / conversationLog.length;

  const passed = intentCorrect &&
                 (dataAccuracy >= 80 || Object.keys(testCase.expectedExtraction).length === 0);

  return {
    testId: testCase.id,
    scenario: testCase.scenario,
    passed,
    metrics: {
      intentAccuracy: intentCorrect,
      dataExtractionAccuracy: dataAccuracy,
      totalMessages: testCase.messages.length,
      averageLatency: avgLatency,
    },
    errors,
    extractedData: allExtractedData,
    conversationLog,
  };
}

export async function runAllTests(): Promise<{results: TestResult[], dashboard: DashboardMetrics}> {
  console.log(`\nRunning ${TEST_CASES.length} test cases...\n`);

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    const result = await runSingleTest(testCase);
    results.push(result);

    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${status} ${result.testId}: ${result.scenario}`);
    if (!result.passed) {
      result.errors.forEach(err => console.log(`   ${err}`));
    }
  }

  const dashboard = calculateDashboardMetrics(results);

  return { results, dashboard };
}

function calculateDashboardMetrics(results: TestResult[]): DashboardMetrics {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

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
    performance: {
      avgLatency,
      minLatency,
      maxLatency,
    },
  };
}

// Main execution
if (require.main === module) {
  runAllTests().then(({ dashboard }) => {
    console.log('\n' + '='.repeat(80));
    console.log('TEST DASHBOARD');
    console.log('='.repeat(80));
    console.log(`\nOverall: ${dashboard.passedTests}/${dashboard.totalTests} passed (${dashboard.overallAccuracy.toFixed(1)}%)`);
    console.log(`\nIntent Detection: ${dashboard.intentDetection.accuracy.toFixed(1)}% accurate`);
    Object.entries(dashboard.intentDetection.byIntent).forEach(([intent, data]) => {
      console.log(`   ${intent}: ${data.correct}/${data.total} (${data.accuracy.toFixed(1)}%)`);
    });
    console.log(`\nData Extraction: ${dashboard.dataExtraction.avgAccuracy.toFixed(1)}% average`);
    Object.entries(dashboard.dataExtraction.byField).forEach(([field, data]) => {
      if (data.total > 0) {
        console.log(`   ${field}: ${data.correct}/${data.total} (${data.accuracy.toFixed(1)}%)`);
      }
    });
    console.log(`\nPerformance:`);
    console.log(`   Average Latency: ${dashboard.performance.avgLatency.toFixed(0)}ms`);
    console.log(`   Min: ${dashboard.performance.minLatency.toFixed(0)}ms | Max: ${dashboard.performance.maxLatency.toFixed(0)}ms`);
    console.log('\n' + '='.repeat(80));
  });
}
