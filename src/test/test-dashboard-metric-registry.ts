import { getMetricSpec } from '../lib/metricRegistry.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  console.log('--- Testing dashboard metric registry ---');
  const metric = getMetricSpec('total_maid_registrations');
  assert(metric, 'Expected total_maid_registrations metric to exist');
  assert(
    metric?.sourceTables[0] === 'helper_registrations',
    `Expected helper_registrations source table, got ${metric?.sourceTables[0]}`,
  );
  assert(
    metric?.formula.includes('helper_registrations'),
    `Expected helper_registrations in formula, got ${metric?.formula}`,
  );
  console.log('PASS dashboard metric registry uses helper_registrations table');
}

main();
