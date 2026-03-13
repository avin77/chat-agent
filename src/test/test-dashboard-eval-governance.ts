import {
  buildGovernanceChecklistRows,
  evaluateEvalGovernance,
} from '../lib/evalGovernance.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  console.log('--- Testing dashboard governance presentation contract ---');

  const blocked = evaluateEvalGovernance({
    state: {
      filename: 'eval-state-2026-03-12T10-00-00-000Z.json',
      payload: { datasetName: 'state', overallScore: 100, failedTurns: [] },
    },
    unhappy: {
      filename: 'eval-state-2026-03-12T10-01-00-000Z.json',
      payload: {
        datasetName: 'unhappy',
        overallScore: 96,
        failedTurns: [{ conv: 'c56', turn: 4 }],
        categoryScores: {
          synonym_hinglish_service: { pass: 3, fail: 5, total: 8 },
        },
      },
    },
  });

  const rows = buildGovernanceChecklistRows(blocked, {
    stuckLoopRate: 1,
    safetyNetTriggerRate: 1,
    repeatQuestionRate: 1,
  });

  const normalRow = rows.find((row) => row.key === 'track-normal');
  assert(normalRow, 'Expected a normal-track checklist row');
  assert(normalRow?.pass === false, 'Expected missing normal track to render as blocked');
  assert(
    normalRow?.detail.includes('npm run eval:json'),
    `Expected normal-track detail to tell PM how to generate the missing artifact, got ${normalRow?.detail}`,
  );

  const unhappyRow = rows.find((row) => row.key === 'track-unhappy');
  assert(unhappyRow, 'Expected an unhappy-track checklist row');
  assert(
    unhappyRow?.detail.includes('c56') || unhappyRow?.detail.includes('synonym_hinglish_service'),
    `Expected unhappy-track detail to surface blocker context, got ${unhappyRow?.detail}`,
  );

  console.log('PASS dashboard governance presentation contract');
}

main();
