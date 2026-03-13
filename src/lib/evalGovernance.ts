export type EvalTrack = 'normal' | 'state' | 'unhappy';
export type EvalReleaseVerdict = 'pass' | 'warn' | 'block';
export type EvalTrackStatus = 'pass' | 'warn' | 'block' | 'missing';

export interface EvalFailedTurn {
  conv?: string;
  turn?: number;
  reason?: string;
  user?: string;
  expected?: string;
  actual?: string;
}

export interface EvalCategoryScore {
  pass?: number;
  fail?: number;
  total?: number;
}

export interface EvalConversationTurn {
  pass?: boolean;
}

export interface EvalConversation {
  id?: string;
  category?: string;
  failed?: boolean;
  turns?: EvalConversationTurn[];
}

export interface EvalArtifactPayload {
  datasetName?: string;
  overallScore?: number;
  verdict?: string;
  timestamp?: string;
  totalConversations?: number;
  failedTurns?: EvalFailedTurn[];
  categoryScores?: Record<string, EvalCategoryScore>;
  conversations?: EvalConversation[];
  score?: {
    passed?: number;
    total?: number;
    pct?: number;
  };
  categories?: Record<string, { pass?: number; fail?: number }>;
  failedTests?: Array<{ id?: string; name?: string; category?: string }>;
}

export interface EvalArtifactInput {
  filename: string;
  payload: EvalArtifactPayload | null;
}

export interface EvalBlockerSpec {
  id: string;
  kind: 'conversation' | 'category';
  label: string;
  description: string;
}

export interface EvalTrackPolicy {
  track: EvalTrack;
  label: string;
  command: string;
  minScore: number;
  required: boolean;
  blockers: EvalBlockerSpec[];
}

export interface EvalBlockerResult extends EvalBlockerSpec {
  failing: boolean;
  detail: string;
}

export interface EvalTrackResult {
  track: EvalTrack;
  label: string;
  command: string;
  required: boolean;
  status: EvalTrackStatus;
  score: number | null;
  minScore: number;
  file: string | null;
  reasons: string[];
  blockerResults: EvalBlockerResult[];
}

export interface EvalGovernanceResult {
  releaseVerdict: EvalReleaseVerdict;
  tracks: EvalTrackResult[];
  blockingReasons: string[];
  warningReasons: string[];
  latestFiles: Record<EvalTrack, string | null>;
}

export interface AgenticQualitySnapshot {
  stuckLoopRate: number;
  safetyNetTriggerRate: number;
  repeatQuestionRate: number;
  shadowAgreement?: number;
  shadowTotalLogs?: number;
  isShadowReady?: boolean;
}

export interface GovernanceChecklistRow {
  key: string;
  label: string;
  pass: boolean | null;
  detail: string;
}

export const EVAL_GOVERNANCE_POLICY: Record<EvalTrack, EvalTrackPolicy> = {
  normal: {
    track: 'normal',
    label: 'eval:normal',
    command: 'npm run eval:json',
    minScore: 95,
    required: true,
    blockers: [],
  },
  state: {
    track: 'state',
    label: 'eval:state',
    command: 'npm run eval:state',
    minScore: 95,
    required: true,
    blockers: [
      {
        id: 'c15',
        kind: 'conversation',
        label: 'c15',
        description: 'Known state-track blocker slice from roadmap baseline.',
      },
      {
        id: 'c28',
        kind: 'conversation',
        label: 'c28',
        description: 'Known state-track blocker slice from roadmap baseline.',
      },
    ],
  },
  unhappy: {
    track: 'unhappy',
    label: 'eval:unhappy',
    command: 'npm run eval:unhappy',
    minScore: 90,
    required: true,
    blockers: [
      {
        id: 'c56',
        kind: 'conversation',
        label: 'c56',
        description: 'Known unhappy-path blocker conversation for synonym/recovery drift.',
      },
      {
        id: 'synonym_hinglish_service',
        kind: 'category',
        label: 'synonym_hinglish_service',
        description: 'Known unhappy-path blocker category for Hinglish service synonyms.',
      },
    ],
  },
};

const TRACK_ORDER: EvalTrack[] = ['state', 'unhappy', 'normal'];

function normalizeDatasetName(datasetName?: string): EvalTrack | null {
  const normalized = datasetName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'state') {
    return 'state';
  }
  if (normalized === 'unhappy') {
    return 'unhappy';
  }
  if (normalized === 'normal' || normalized === 'default') {
    return 'normal';
  }

  return null;
}

export function normalizeEvalArtifactPayload(
  payload: EvalArtifactPayload | null | undefined,
  filename?: string,
): EvalArtifactPayload | null {
  if (!payload) {
    return null;
  }

  const datasetName =
    payload.datasetName ||
    (filename?.toLowerCase().startsWith('eval-normal-') ? 'normal' : undefined);
  const overallScore =
    typeof payload.overallScore === 'number'
      ? payload.overallScore
      : typeof payload.score?.pct === 'number'
        ? payload.score.pct
        : undefined;

  const categoryScores =
    payload.categoryScores ||
    (payload.categories
      ? Object.fromEntries(
          Object.entries(payload.categories).map(([key, value]) => [
            key,
            {
              pass: value?.pass ?? 0,
              fail: value?.fail ?? 0,
              total: (value?.pass ?? 0) + (value?.fail ?? 0),
            },
          ]),
        )
      : undefined);

  const failedTurns =
    payload.failedTurns ||
    payload.failedTests?.map((test) => ({
      conv: test.id,
      turn: 1,
      reason: test.name || test.category || 'failed_test',
    }));

  const totalConversations =
    typeof payload.totalConversations === 'number'
      ? payload.totalConversations
      : typeof payload.score?.total === 'number'
        ? payload.score.total
        : undefined;

  return {
    ...payload,
    datasetName,
    overallScore,
    categoryScores,
    failedTurns,
    totalConversations,
  };
}

export function classifyEvalTrack(
  filename: string,
  payload?: EvalArtifactPayload | null,
): EvalTrack | null {
  const normalizedPayload = normalizeEvalArtifactPayload(payload, filename);
  const datasetTrack = normalizeDatasetName(normalizedPayload?.datasetName);
  if (datasetTrack) {
    return datasetTrack;
  }

  const normalizedName = filename.trim().toLowerCase();
  if (normalizedName.startsWith('eval-unhappy-')) {
    return 'unhappy';
  }
  if (normalizedName.startsWith('eval-state-')) {
    return 'state';
  }
  if (normalizedName.startsWith('eval-')) {
    return 'normal';
  }

  return null;
}

export function selectLatestEvalTrackArtifacts(
  artifacts: EvalArtifactInput[],
): Partial<Record<EvalTrack, EvalArtifactInput>> {
  const sorted = [...artifacts].sort((left, right) =>
    right.filename.localeCompare(left.filename),
  );
  const selected: Partial<Record<EvalTrack, EvalArtifactInput>> = {};

  for (const artifact of sorted) {
    const track = classifyEvalTrack(artifact.filename, artifact.payload);
    if (!track || selected[track]) {
      continue;
    }
    selected[track] = artifact;
  }

  return selected;
}

function hasConversationFailure(
  payload: EvalArtifactPayload | null | undefined,
  conversationId: string,
): boolean {
  if (!payload) {
    return false;
  }

  if ((payload.failedTurns || []).some((turn) => turn.conv === conversationId)) {
    return true;
  }

  return (payload.conversations || []).some((conversation) => {
    if (conversation.id !== conversationId) {
      return false;
    }

    if (conversation.failed) {
      return true;
    }

    return (conversation.turns || []).some((turn) => turn.pass === false);
  });
}

function hasCategoryFailure(
  payload: EvalArtifactPayload | null | undefined,
  category: string,
): boolean {
  if (!payload) {
    return false;
  }

  const categoryScore = payload.categoryScores?.[category];
  if (typeof categoryScore?.fail === 'number' && categoryScore.fail > 0) {
    return true;
  }

  return (payload.conversations || []).some((conversation) => {
    if (conversation.category !== category) {
      return false;
    }

    if (conversation.failed) {
      return true;
    }

    return (conversation.turns || []).some((turn) => turn.pass === false);
  });
}

function evaluateBlockers(
  policy: EvalTrackPolicy,
  payload: EvalArtifactPayload | null | undefined,
): EvalBlockerResult[] {
  return policy.blockers.map((blocker) => {
    const failing =
      blocker.kind === 'conversation'
        ? hasConversationFailure(payload, blocker.id)
        : hasCategoryFailure(payload, blocker.id);

    return {
      ...blocker,
      failing,
      detail: failing
        ? `${blocker.label} still has unresolved failures`
        : `${blocker.label} is clear`,
    };
  });
}

export function evaluateEvalGovernance(
  selectedArtifacts: Partial<Record<EvalTrack, EvalArtifactInput>>,
  policy: Record<EvalTrack, EvalTrackPolicy> = EVAL_GOVERNANCE_POLICY,
): EvalGovernanceResult {
  const tracks: EvalTrackResult[] = [];
  const blockingReasons: string[] = [];
  const warningReasons: string[] = [];
  const latestFiles: Record<EvalTrack, string | null> = {
    normal: null,
    state: null,
    unhappy: null,
  };

  for (const track of TRACK_ORDER) {
    const trackPolicy = policy[track];
    const selected = selectedArtifacts[track] ?? null;
    const payload = normalizeEvalArtifactPayload(selected?.payload ?? null, selected?.filename);
    const score =
      typeof payload?.overallScore === 'number' ? payload.overallScore : null;
    const blockerResults = evaluateBlockers(trackPolicy, payload);
    const reasons: string[] = [];
    let status: EvalTrackStatus = 'pass';

    latestFiles[track] = selected?.filename ?? null;

    if (!selected || !payload || score === null) {
      status = 'missing';
      reasons.push(
        trackPolicy.required
          ? `Missing required ${trackPolicy.label} artifact. Run \`${trackPolicy.command}\`.`
          : `Missing optional ${trackPolicy.label} artifact.`,
      );
    } else {
      if (score < trackPolicy.minScore) {
        status = 'block';
        reasons.push(
          `${trackPolicy.label} score ${score}% is below the ${trackPolicy.minScore}% floor.`,
        );
      }

      const failingBlockers = blockerResults.filter((result) => result.failing);
      if (failingBlockers.length > 0) {
        status = 'block';
        reasons.push(
          `${trackPolicy.label} has unresolved blocker slices: ${failingBlockers
            .map((result) => result.label)
            .join(', ')}.`,
        );
      }
    }

    if (status === 'missing') {
      if (trackPolicy.required) {
        blockingReasons.push(...reasons);
        status = 'block';
      } else {
        warningReasons.push(...reasons);
        status = 'warn';
      }
    } else if (status === 'block') {
      blockingReasons.push(...reasons);
    } else if (reasons.length > 0) {
      status = 'warn';
      warningReasons.push(...reasons);
    }

    tracks.push({
      track,
      label: trackPolicy.label,
      command: trackPolicy.command,
      required: trackPolicy.required,
      status,
      score,
      minScore: trackPolicy.minScore,
      file: selected?.filename ?? null,
      reasons,
      blockerResults,
    });
  }

  const releaseVerdict: EvalReleaseVerdict =
    blockingReasons.length > 0 ? 'block' : warningReasons.length > 0 ? 'warn' : 'pass';

  return {
    releaseVerdict,
    tracks,
    blockingReasons,
    warningReasons,
    latestFiles,
  };
}

export function buildGovernanceChecklistRows(
  result: EvalGovernanceResult | null,
  agenticQuality: Partial<AgenticQualitySnapshot> | null,
): GovernanceChecklistRow[] {
  const quality = agenticQuality ?? null;
  const rows: GovernanceChecklistRow[] = [];

  if (result) {
    for (const track of TRACK_ORDER) {
      const trackResult = result.tracks.find((item) => item.track === track);
      if (!trackResult) {
        continue;
      }

      const detailParts: string[] = [];
      if (trackResult.score !== null) {
        detailParts.push(`${trackResult.score}%`);
      } else {
        detailParts.push(`Run ${trackResult.command}`);
      }
      if (trackResult.file) {
        detailParts.push(trackResult.file);
      }
      if (trackResult.reasons.length > 0) {
        detailParts.push(trackResult.reasons.join(' '));
      }

      rows.push({
        key: `track-${track}`,
        label: `${trackResult.label} score >= ${trackResult.minScore}%`,
        pass:
          trackResult.status === 'pass'
            ? true
            : trackResult.status === 'warn' || trackResult.status === 'block'
              ? false
              : null,
        detail: detailParts.join(' • '),
      });
    }
  }

  const metricRows: Array<{
    key: string;
    label: string;
    value: number | undefined;
    comparator: (value: number) => boolean;
  }> = [
    {
      key: 'metric-stuck-loop',
      label: 'Stuck Loop Rate < 5%',
      value: quality?.stuckLoopRate,
      comparator: (value) => value < 5,
    },
    {
      key: 'metric-safety-net',
      label: 'Safety Net Trigger Rate < 5%',
      value: quality?.safetyNetTriggerRate,
      comparator: (value) => value < 5,
    },
    {
      key: 'metric-repeat-question',
      label: 'Repeat Question Rate < 5%',
      value: quality?.repeatQuestionRate,
      comparator: (value) => value < 5,
    },
    {
      key: 'shadow-agreement',
      label: 'Shadow Agreement >= 95%',
      value: quality?.shadowAgreement,
      comparator: (value) => value >= 95,
    },
    {
      key: 'shadow-coverage',
      label: 'Shadow Coverage >= 10 turns',
      value: quality?.shadowTotalLogs,
      comparator: (value) => value >= 10,
    },
  ];

  for (const metric of metricRows) {
    const hasValue = typeof metric.value === 'number';
    let detail = 'No data';
    if (hasValue) {
      detail = metric.key === 'shadow-coverage' ? `${metric.value} turns` : `${metric.value}%`;
    }

    rows.push({
      key: metric.key,
      label: metric.label,
      pass: hasValue ? metric.comparator(metric.value as number) : null,
      detail,
    });
  }

  // Shadow readiness signal (ROLL-01)
  if (quality?.isShadowReady !== undefined) {
    rows.push({
      key: 'shadow-readiness',
      label: 'Shadow Readiness (7-day trend)',
      pass: quality.isShadowReady,
      detail: quality.isShadowReady ? 'PASSED' : 'IN PROGRESS',
    });
  }

  return rows;
}
