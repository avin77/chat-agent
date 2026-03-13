import {
  classifyEvalTrack,
  evaluateEvalGovernance,
  selectLatestEvalTrackArtifacts,
} from '../lib/evalGovernance.ts';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  console.log('--- Testing eval governance contract ---');

  const passing = evaluateEvalGovernance({
    state: {
      filename: 'eval-state-2026-03-12T10-00-00-000Z.json',
      payload: {
        datasetName: 'state',
        overallScore: 100,
        failedTurns: [],
      },
    },
    unhappy: {
      filename: 'eval-state-2026-03-12T10-01-00-000Z.json',
      payload: {
        datasetName: 'unhappy',
        overallScore: 96,
        failedTurns: [],
        categoryScores: {
          synonym_hinglish_service: { pass: 8, fail: 0, total: 8 },
        },
      },
    },
    normal: {
      filename: 'eval-2026-03-12T10-02-00-000Z.json',
      payload: {
        datasetName: 'normal',
        overallScore: 97,
        failedTurns: [],
      },
    },
  });
  assert(passing.releaseVerdict === 'pass', `Expected pass, got ${passing.releaseVerdict}`);

  const unhappyBelowFloor = evaluateEvalGovernance({
    state: {
      filename: 'eval-state-2026-03-12T10-00-00-000Z.json',
      payload: { datasetName: 'state', overallScore: 100, failedTurns: [] },
    },
    unhappy: {
      filename: 'eval-state-2026-03-12T10-01-00-000Z.json',
      payload: {
        datasetName: 'unhappy',
        overallScore: 89,
        failedTurns: [],
        categoryScores: {
          synonym_hinglish_service: { pass: 8, fail: 0, total: 8 },
        },
      },
    },
    normal: {
      filename: 'eval-2026-03-12T10-02-00-000Z.json',
      payload: { datasetName: 'normal', overallScore: 97, failedTurns: [] },
    },
  });
  assert(
    unhappyBelowFloor.releaseVerdict === 'block',
    `Expected unhappy-below-floor to block, got ${unhappyBelowFloor.releaseVerdict}`,
  );

  const blockerPresent = evaluateEvalGovernance({
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
    normal: {
      filename: 'eval-2026-03-12T10-02-00-000Z.json',
      payload: { datasetName: 'normal', overallScore: 97, failedTurns: [] },
    },
  });
  assert(
    blockerPresent.releaseVerdict === 'block',
    `Expected blocker-slice result to block, got ${blockerPresent.releaseVerdict}`,
  );
  assert(
    blockerPresent.blockingReasons.some((reason) => reason.includes('c56') || reason.includes('synonym_hinglish_service')),
    'Expected blocker reasons to mention c56 or synonym_hinglish_service',
  );

  const missingNormal = evaluateEvalGovernance({
    state: {
      filename: 'eval-state-2026-03-12T10-00-00-000Z.json',
      payload: { datasetName: 'state', overallScore: 100, failedTurns: [] },
    },
    unhappy: {
      filename: 'eval-state-2026-03-12T10-01-00-000Z.json',
      payload: {
        datasetName: 'unhappy',
        overallScore: 96,
        failedTurns: [],
        categoryScores: {
          synonym_hinglish_service: { pass: 8, fail: 0, total: 8 },
        },
      },
    },
  });
  assert(
    missingNormal.releaseVerdict === 'block',
    `Expected missing normal track to block, got ${missingNormal.releaseVerdict}`,
  );

  assert(
    classifyEvalTrack('eval-state-2026-03-12T10-00-00-000Z.json', { datasetName: 'unhappy' }) === 'unhappy',
    'Expected datasetName to override eval-state filename classification',
  );
  assert(
    classifyEvalTrack('eval-state-2026-03-12T10-00-00-000Z.json', { datasetName: 'state' }) === 'state',
    'Expected state file to classify as state',
  );

  const normalizedNormal = evaluateEvalGovernance(
    selectLatestEvalTrackArtifacts([
      {
        filename: 'eval-normal-2026-03-12T10-02-00-000Z.json',
        payload: {
          timestamp: '2026-03-12T10:02:00.000Z',
          score: { passed: 13, total: 14, pct: 93 } as never,
          categories: {
            FAQ: { pass: 4, fail: 1 },
          } as never,
          failedTests: [{ id: 'faq_01' }] as never,
          verdict: 'WARN',
        },
      },
      {
        filename: 'eval-state-2026-03-12T10-00-00-000Z.json',
        payload: { datasetName: 'state', overallScore: 100, failedTurns: [] },
      },
      {
        filename: 'eval-unhappy-2026-03-12T10-01-00-000Z.json',
        payload: {
          datasetName: 'unhappy',
          overallScore: 96,
          failedTurns: [],
          categoryScores: {
            synonym_hinglish_service: { pass: 8, fail: 0, total: 8 },
          },
        },
      },
    ]),
  );
  const normalTrack = normalizedNormal.tracks.find((track) => track.track === 'normal');
  assert(normalTrack, 'Expected normal track to be present after artifact selection');
  assert(normalTrack?.score === 93, `Expected normal eval score 93, got ${normalTrack?.score}`);
  assert(
    normalTrack?.file === 'eval-normal-2026-03-12T10-02-00-000Z.json',
    `Expected copied normal artifact to be selected, got ${normalTrack?.file}`,
  );

  console.log('PASS eval governance contract');
}

main();
