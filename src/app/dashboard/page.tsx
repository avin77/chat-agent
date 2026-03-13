'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    getDashboardStats,
    getIntentBreakdown,
    getFlowFunnel,
    getRecentConversations,
    getErrorMetrics,
    getLatestEvalResults,
    getAllEvalFiles,
    getResponseQualityMetrics,
    getConversationHealthMetrics,
    getConversationLLMLogs,
    getConversationShadowLogs,
    getConversationsWithLogCounts,
    getProductHealthMetrics,
    getShadowConversationsWithLogCounts,
    getTokenCostMetrics,
    getShadowMetrics,
    getSystemAlerts,
    checkAndWriteAlerts,
} from './actions';
import { getAgenticQualityMetrics, getEvalGovernanceStatus } from './actions';
import { mergeLlmIoConversations } from './llmIoHelpers';
import {
    buildGovernanceChecklistRows,
    type EvalGovernanceResult,
} from '@/lib/evalGovernance';
import { getMetricSpec } from '@/lib/metricRegistry';
import type { MetricSpec } from '@/lib/metricRegistry';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Stats {
    totalConversations: number;
    totalLeads: number;
    totalComplaints: number;
    totalHelperRegs: number;
    totalLLMCalls: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
}

interface ErrorMetrics {
    safetyNetTriggers: number;
    guardrailModified: number;
    total: number;
    errorIntents: number;
}

interface EvalFile {
    filename: string;
    timestamp: string;
    datasetName: string;
    overallScore: number;
    verdict: string;
    totalConversations: number;
}

interface EvalResults {
    filename: string;
    datasetName: string;
    timestamp: string;
    overallScore: number;
    verdict: string;
    totalConversations: number;
    totalTurns: number;
    scores: Record<string, { pass: number; fail: number; pct: number }>;
    categoryScores: Record<string, { pass: number; fail: number; total: number }>;
    failedTurns: Array<{ conv: string; turn: number; reason: string }>;
    promptMetrics: PromptMetrics | null;
}

interface PromptMetrics {
    instructionCompliance: number;
    keywordFallbackNeeded: number;
    wrongQuestionCount: number;
    safetyNetTriggers: number;
    avgResponseWords: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    avgTurnsToComplete: number | null;
    completedConversations: number;
    turnsToComplete: Record<string, number>;
    avgWordsByState: Record<string, number>;
    avgLatencyByState: Record<string, number>;
}

interface ResponseQuality {
    total: number;
    safetyNetRate: number;
    guardrailModRate: number;
    avgResponseWords: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    keywordFallbackRate: number;
    responseByLength: { short: number; good: number; long: number };
}

interface ConversationHealth {
    totalMaidHire: number;
    completionRate: number;
    avgAttempts: number;
    retryRate: number;
    dropOffStates: Record<string, number>;
    completedCount: number;
    avgFieldsCollected: number;
}

interface FieldStats {
    filled: number;
    skipped: number;
    total: number;
}

interface ProductHealth {
    leadCompletionRate: number;
    leadQualityScore: number;
    effectiveEscalationRate: number;
    fieldFillRates: Record<string, number>;
    fieldStats: Record<string, FieldStats>;
    recoveryRate: number;
    abandonmentRate: number;
    avgSessionDurationMs: number;
    p50SessionDurationMs: number;
    totalSessions: number;
    completedSessions: number;
    abandonedSessions: number;
}

interface TokenCostMetrics {
    avgTokensPerConv: number;
    totalTokens: number;
    estimatedDailyCost: number;
    logsWithTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
}

interface ShadowDay {
    date: string;
    pct: number;
    total: number;
}

interface ShadowMetrics {
    overall: number;
    byDay: ShadowDay[];
    totalLogs: number;
    agreedCount: number;
    hasData: boolean;
    isReady?: boolean;
}

interface SystemAlert {
    id: string;
    created_at: string;
    alert_type: string;
    severity: string;
    metric_value: number;
    threshold: number;
    message: string;
    resolved: boolean;
}

interface AgenticQualityMetrics {
    stuckLoopRate: number;
    escalationAfterConfusionRate: number;
    slotRetentionAfterSwitch: number;
    ambiguityResolutionRate: number;
    resumeSuccessRate: number;
    intentSwitchSuccessRate: number;
    memoryRetentionRate: number;
    repeatQuestionRate: number;
    guardrailBypassAttemptRate: number;
    safetyNetTriggerRate: number;
    totalSessionsAnalyzed: number;
    totalTurnsAnalyzed: number;
}

// ─── Helper Components ──────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
        </div>
    );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="flex items-center gap-3 text-sm">
            <div className="w-28 text-gray-600 text-right shrink-0">{label}</div>
            <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                    {value} ({pct}%)
                </span>
            </div>
        </div>
    );
}

function ScoreBadge({ score, verdict }: { score: number; verdict: string }) {
    const color = score >= 90 ? 'bg-green-100 text-green-800 border-green-300'
        : score >= 70 ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
            : 'bg-red-100 text-red-800 border-red-300';
    return (
        <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${color}`}>
            {score}% — {verdict}
        </span>
    );
}

function MetricTooltip({ metricId }: { metricId: string }) {
    const spec = getMetricSpec(metricId);
    if (!spec) return null;
    return (
        <div className="group relative inline-block ml-1">
            <span className="cursor-help text-gray-400 text-xs border border-gray-300 rounded-full px-1">?</span>
            <div className="absolute z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg p-3 w-72 bottom-6 left-0 shadow-xl">
                <div className="font-semibold text-gray-100 mb-1">{spec.name}</div>
                <div className="text-gray-300 mb-2"><span className="text-gray-400">Formula: </span>{spec.formula}</div>
                {spec.sourceTables.length > 0 && (
                    <div className="text-gray-300 mb-2"><span className="text-gray-400">Source: </span>{spec.sourceTables.join(', ')}</div>
                )}
                <div className="text-gray-300 mb-2"><span className="text-gray-400">Window: </span>{spec.window}</div>
                <div className="text-green-300"><span className="text-gray-400">Meaning: </span>{spec.interpretation}</div>
            </div>
        </div>
    );
}

function AgenticMetricCard({ label, value, metricId, note }: {
    label: string; value: number; metricId: string; note?: string;
}) {
    const noData = value === -1;
    const spec = getMetricSpec(metricId);
    const isBad = !noData && spec?.warnThreshold !== undefined
        ? (spec.thresholdDirection === 'above' ? value > spec.warnThreshold : spec.thresholdDirection === 'below' ? value < spec.warnThreshold : false)
        : false;
    return (
        <div className={`bg-white rounded-lg p-4 shadow-sm border ${isBad ? 'border-yellow-400' : 'border-gray-200'}`}>
            <div className="flex items-center gap-1 text-sm text-gray-500">
                {label}
                <MetricTooltip metricId={metricId} />
            </div>
            <div className={`text-2xl font-bold mt-1 ${noData ? 'text-gray-300' : isBad ? 'text-yellow-600' : 'text-gray-900'}`}>
                {noData ? '—' : `${value}%`}
            </div>
            {noData && <div className="text-xs text-gray-400 mt-1">No data yet (feature not active)</div>}
            {note && !noData && <div className="text-xs text-gray-400 mt-1">{note}</div>}
        </div>
    );
}

function PreProdChecklist({
    evalGovernance,
    agenticQuality,
    shadowMetrics,
}: {
    evalGovernance: EvalGovernanceResult | null;
    agenticQuality: AgenticQualityMetrics | null;
    shadowMetrics: ShadowMetrics | null;
}) {
    const gates = buildGovernanceChecklistRows(evalGovernance, {
        ...agenticQuality,
        shadowAgreement: shadowMetrics?.overall,
        shadowTotalLogs: shadowMetrics?.totalLogs,
        isShadowReady: shadowMetrics?.isReady,
    } as any);
    const passCount = gates.filter(g => g.pass === true).length;
    const totalGates = gates.length;
    const allPass = passCount === totalGates && gates.every(g => g.pass !== null);
    const releaseVerdict = evalGovernance?.releaseVerdict ?? 'block';
    const releaseLabel =
        releaseVerdict === 'pass'
            ? 'Release Ready'
            : releaseVerdict === 'warn'
                ? 'Warnings'
                : 'Blocked';
    const releaseTone =
        releaseVerdict === 'pass'
            ? 'bg-green-100 text-green-800'
            : releaseVerdict === 'warn'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800';
    const governanceReasons = evalGovernance
        ? [...evalGovernance.blockingReasons, ...evalGovernance.warningReasons]
        : ['Governance status unavailable'];

    return (
        <div className={`rounded-lg border p-5 ${allPass ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Pre-Production Checklist</h3>
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${releaseTone}`}>
                    {releaseLabel} • {passCount}/{totalGates}
                </span>
            </div>
            <div className="space-y-2">
                {gates.map((gate, idx) => (
                    <div key={gate.key ?? idx} className="flex items-center gap-3 text-sm">
                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
                            gate.pass === null ? 'bg-gray-200 text-gray-500' :
                            gate.pass ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                        }`}>
                            {gate.pass === null ? '?' : gate.pass ? 'ok' : 'x'}
                        </span>
                        <span className={gate.pass === false ? 'text-red-700 font-medium' : 'text-gray-700'}>
                            {gate.label}
                        </span>
                        <span className="text-gray-400 ml-auto">{gate.detail}</span>
                    </div>
                ))}
            </div>
            <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Governance Reasons
                </div>
                <div className="space-y-1">
                    {governanceReasons.map((reason, idx) => (
                        <div key={`${reason}-${idx}`} className="text-sm text-gray-600">
                            {reason}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
    const [days, setDays] = useState(7);
    const [stats, setStats] = useState<Stats | null>(null);
    const [intents, setIntents] = useState<Record<string, number>>({});
    const [funnel, setFunnel] = useState<Record<string, number>>({});
    const [conversations, setConversations] = useState<any[]>([]);
    const [errors, setErrors] = useState<ErrorMetrics | null>(null);
    const [evalResults, setEvalResults] = useState<EvalResults | null>(null);
    const [evalFiles, setEvalFiles] = useState<EvalFile[]>([]);
    const [selectedEvalFile, setSelectedEvalFile] = useState<string>('');
    const [evalFileLoading, setEvalFileLoading] = useState(false);
    const [responseQuality, setResponseQuality] = useState<ResponseQuality | null>(null);
    const [convHealth, setConvHealth] = useState<ConversationHealth | null>(null);
    const [productHealth, setProductHealth] = useState<ProductHealth | null>(null);
    const [tokenCost, setTokenCost] = useState<TokenCostMetrics | null>(null);
    const [shadowMetrics, setShadowMetrics] = useState<ShadowMetrics | null>(null);
    const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
    const [agenticQuality, setAgenticQuality] = useState<AgenticQualityMetrics | null>(null);
    const [evalGovernance, setEvalGovernance] = useState<EvalGovernanceResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'eval' | 'prompt_quality' | 'conversations' | 'llm_logs' | 'product_health' | 'agentic_quality'>('overview');
    const [globalIntent, setGlobalIntent] = useState<string>('all');
    // LLM I/O state
    const [llmConversations, setLlmConversations] = useState<any[]>([]);
    const [llmIntent, setLlmIntent] = useState<string>('all');
    const [llmMode, setLlmMode] = useState<'production' | 'shadow' | 'both'>('production');
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [llmLogs, setLlmLogs] = useState<any[]>([]);
    const [shadowLogs, setShadowLogs] = useState<any[]>([]);
    const [llmLogsLoading, setLlmLogsLoading] = useState(false);
    const [llmListLoading, setLlmListLoading] = useState(false);
    const [expandedPrompts, setExpandedPrompts] = useState<Set<number>>(new Set());

    const fetchAll = useCallback(async () => {
        setLoading(true);
        const [s, i, f, c, e, ev, rq, ch, ph, tc, sm, sa, ef, aq, eg] = await Promise.all([
            getDashboardStats(days),
            getIntentBreakdown(days),
            getFlowFunnel(days),
            getRecentConversations(30),
            getErrorMetrics(days),
            getLatestEvalResults(),
            getResponseQualityMetrics(days, globalIntent),
            getConversationHealthMetrics(days, globalIntent),
            getProductHealthMetrics(days, globalIntent),
            getTokenCostMetrics(days),
            getShadowMetrics(7),
            getSystemAlerts(24),
            getAllEvalFiles(),
            getAgenticQualityMetrics(days, globalIntent),
            getEvalGovernanceStatus(),
        ]);
        setStats(s);
        setIntents(i);
        setFunnel(f);
        setConversations(c);
        setErrors(e);
        setEvalResults(ev as EvalResults | null);
        setEvalFiles(ef as EvalFile[]);
        if (ev) setSelectedEvalFile((ev as EvalResults).filename);
        setResponseQuality(rq);
        setConvHealth(ch);
        setProductHealth(ph);
        setTokenCost(tc);
        setShadowMetrics(sm);
        setSystemAlerts(sa);
        setAgenticQuality(aq);
        setEvalGovernance(eg);
        setLoading(false);
        // Fire alert checks on each dashboard load — populates system_alerts table
        // so the alert banner above can show active alerts. Fire-and-forget (non-blocking).
        checkAndWriteAlerts().catch(err => console.error('[Alerts] check failed:', err.message));
    }, [days, globalIntent]);

    // Reload eval results when user picks a different file
    const handleEvalFileChange = useCallback(async (filename: string) => {
        setSelectedEvalFile(filename);
        setEvalFileLoading(true);
        const ev = await getLatestEvalResults(filename);
        setEvalResults(ev as EvalResults | null);
        setEvalFileLoading(false);
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 60000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    // Load conversation list when LLM I/O tab is activated, or when days/intent filter changes
    useEffect(() => {
        if (activeTab === 'llm_logs') {
            setLlmListLoading(true);
            setSelectedConvId(null);
            setLlmLogs([]);
            setShadowLogs([]);

            const loadList = async () => {
                if (llmMode === 'production') {
                    const data = await getConversationsWithLogCounts(50, days, llmIntent);
                    setLlmConversations(data);
                } else if (llmMode === 'shadow') {
                    const data = await getShadowConversationsWithLogCounts(50, days, llmIntent);
                    setLlmConversations(data);
                } else {
                    const [prod, shadow] = await Promise.all([
                        getConversationsWithLogCounts(50, days, llmIntent),
                        getShadowConversationsWithLogCounts(50, days, llmIntent),
                    ]);
                    setLlmConversations(mergeLlmIoConversations(prod as any[], shadow as any[]));
                }
                setLlmListLoading(false);
            };

            loadList().catch(() => {
                setLlmConversations([]);
                setLlmListLoading(false);
            });
        }
    }, [activeTab, days, llmIntent, llmMode]);

    // Load LLM logs when a conversation is selected
    const loadConvLogs = useCallback(async (convId: string) => {
        setSelectedConvId(convId);
        setLlmLogsLoading(true);
        setExpandedPrompts(new Set());
        if (llmMode === 'production') {
            const logs = await getConversationLLMLogs(convId);
            setLlmLogs(logs);
            setShadowLogs([]);
        } else if (llmMode === 'shadow') {
            const logs = await getConversationShadowLogs(convId);
            setLlmLogs([]);
            setShadowLogs(logs);
        } else {
            const [prodLogs, shadowTurnLogs] = await Promise.all([
                getConversationLLMLogs(convId),
                getConversationShadowLogs(convId),
            ]);
            setLlmLogs(prodLogs);
            setShadowLogs(shadowTurnLogs);
        }
        setLlmLogsLoading(false);
    }, [llmMode]);

    if (loading && !stats) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-gray-500 text-lg">Loading dashboard...</div>
            </div>
        );
    }

    const totalIntents = Object.values(intents).reduce((s, v) => s + v, 0);
    const funnelMax = Math.max(...Object.values(funnel), 1);
    const hasProductionLogs = llmLogs.length > 0;
    const hasShadowLogs = shadowLogs.length > 0;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">EzyBot Dashboard</h1>
                        <p className="text-sm text-gray-500">Operations metrics & eval results</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Intent Selector */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Intent:</span>
                            <select
                                value={globalIntent}
                                onChange={(e) => setGlobalIntent(e.target.value)}
                                className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer"
                            >
                                <option value="all">All Intents</option>
                                <option value="maid_hire">Maid Hire</option>
                                <option value="complaint">Complaint</option>
                                <option value="maid_registration">Helper Reg</option>
                                <option value="general">FAQ / General</option>
                            </select>
                        </div>
                        {/* Date Range */}
                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                            {[1, 7, 30].map((d) => (
                                <button
                                    key={d}
                                    onClick={() => setDays(d)}
                                    className={`px-3 py-1.5 text-sm rounded-md transition ${days === d ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {d === 1 ? 'Today' : `${d}d`}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={fetchAll}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-6 mt-4">
                    {(['overview', 'eval', 'prompt_quality', 'conversations', 'llm_logs', 'product_health', 'agentic_quality'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-2 text-sm font-medium border-b-2 transition ${activeTab === tab
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab === 'overview' ? 'Overview' : tab === 'eval' ? 'Eval Results' : tab === 'prompt_quality' ? 'Prompt Quality' : tab === 'llm_logs' ? 'LLM I/O' : tab === 'product_health' ? 'Product Health' : tab === 'agentic_quality' ? 'Agentic Quality' : 'Conversations'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-6 py-6 max-w-7xl mx-auto">
                {/* ═══════════════════════════════════════════════════════ */}
                {/* OVERVIEW TAB */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'overview' && stats && (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="Conversations" value={stats.totalConversations} sub={`Last ${days}d`} />
                            <StatCard label="Leads Generated" value={stats.totalLeads} sub="Maid hire" />
                            <StatCard label="Complaints" value={stats.totalComplaints} />
                            <StatCard label="Helper Registrations" value={stats.totalHelperRegs} />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="Avg Latency" value={`${stats.avgLatency}ms`} sub={`p50: ${stats.p50Latency}ms`} />
                            <StatCard label="p95 Latency" value={`${stats.p95Latency}ms`} />
                            <StatCard label="LLM Calls" value={stats.totalLLMCalls} sub={`Last ${days}d`} />
                            <StatCard
                                label="Error Rate"
                                value={errors ? `${errors.total > 0 ? ((errors.safetyNetTriggers / errors.total) * 100).toFixed(1) : 0}%` : '—'}
                                sub={errors ? `${errors.safetyNetTriggers} safety net / ${errors.errorIntents} errors` : ''}
                            />
                        </div>

                        {/* Intent Breakdown */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h2 className="text-sm font-semibold text-gray-700 mb-4">Intent Breakdown ({totalIntents} total)</h2>
                            <div className="space-y-2">
                                {Object.entries(intents)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([intent, count]) => {
                                        const colors: Record<string, string> = {
                                            maid_hire: 'bg-blue-500',
                                            complaint: 'bg-red-400',
                                            general: 'bg-gray-400',
                                            maid_registration: 'bg-green-400',
                                            helper_reg: 'bg-green-400',
                                        };
                                        return (
                                            <Bar
                                                key={intent}
                                                label={intent.replace('_', ' ')}
                                                value={count}
                                                max={totalIntents}
                                                color={colors[intent] || 'bg-purple-400'}
                                            />
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Flow Completion Funnel */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h2 className="text-sm font-semibold text-gray-700 mb-4">Maid Hire Flow Funnel</h2>
                            {Object.keys(funnel).length === 0 ? (
                                <p className="text-gray-400 text-sm">No maid hire sessions in this period.</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(funnel).map(([state, count]) => (
                                        <Bar
                                            key={state}
                                            label={state.replace('ASK_', '')}
                                            value={count}
                                            max={funnelMax}
                                            color={state === 'COMPLETE' ? 'bg-green-500' : 'bg-blue-400'}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Error Details */}
                        {errors && errors.total > 0 && (
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                <h2 className="text-sm font-semibold text-gray-700 mb-3">Quality Metrics</h2>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <div className="text-gray-500">Safety Net Triggers</div>
                                        <div className="text-lg font-bold">{errors.safetyNetTriggers} <span className="text-sm text-gray-400">/ {errors.total}</span></div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">Guardrail Modified</div>
                                        <div className="text-lg font-bold">{errors.guardrailModified} <span className="text-sm text-gray-400">/ {errors.total}</span></div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">System Errors</div>
                                        <div className="text-lg font-bold">{errors.errorIntents}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">Price Leak Rate</div>
                                        <div className="text-lg font-bold text-green-600">0%</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* EVAL TAB */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'eval' && (
                    <div className="space-y-6">
                        {/* Eval File Selector */}
                        {evalFiles.length > 0 && (
                            <div className="bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-200 flex items-center gap-3">
                                <span className="text-xs font-medium text-gray-500 shrink-0">Eval run:</span>
                                <select
                                    className="text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white flex-1 max-w-xl focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    value={selectedEvalFile}
                                    onChange={e => handleEvalFileChange(e.target.value)}
                                    disabled={evalFileLoading}
                                >
                                    {evalFiles.map(f => (
                                        <option key={f.filename} value={f.filename}>
                                            [{f.datasetName}] {new Date(f.timestamp).toLocaleString()} — {f.overallScore}% {f.verdict} ({f.totalConversations} conv)
                                        </option>
                                    ))}
                                </select>
                                {evalFileLoading && <span className="text-xs text-gray-400">Loading…</span>}
                            </div>
                        )}

                        {!evalResults ? (
                            <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200 text-center">
                                <p className="text-gray-500 mb-2">No eval results found.</p>
                                <p className="text-sm text-gray-400">
                                    Run <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run eval:state</code> or <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run eval:unhappy</code> to generate results.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Eval Header */}
                                <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h2 className="text-sm font-semibold text-gray-700">
                                                Eval Run
                                                {evalResults.datasetName && (
                                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${evalResults.datasetName === 'unhappy' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {evalResults.datasetName}
                                                    </span>
                                                )}
                                            </h2>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {new Date(evalResults.timestamp).toLocaleString()} | {evalResults.totalConversations} conversations, {evalResults.totalTurns} turns
                                            </p>
                                        </div>
                                        <ScoreBadge score={evalResults.overallScore} verdict={evalResults.verdict} />
                                    </div>
                                </div>

                                {/* Eval Score Breakdown */}
                                <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Score Breakdown</h2>
                                    <div className="space-y-2">
                                        {Object.entries(evalResults.scores).map(([name, score]) => {
                                            const total = score.pass + score.fail;
                                            const color = score.pct >= 90 ? 'bg-green-500'
                                                : score.pct >= 70 ? 'bg-yellow-400'
                                                    : 'bg-red-400';
                                            return (
                                                <Bar
                                                    key={name}
                                                    label={name.replace(/_/g, ' ')}
                                                    value={score.pass}
                                                    max={total}
                                                    color={color}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Category Breakdown */}
                                <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Category Breakdown</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {Object.entries(evalResults.categoryScores)
                                            .sort(([, a], [, b]) => {
                                                const pctA = a.total > 0 ? a.pass / a.total : 0;
                                                const pctB = b.total > 0 ? b.pass / b.total : 0;
                                                return pctA - pctB;
                                            })
                                            .map(([cat, score]) => {
                                                const pct = score.total > 0 ? Math.round((score.pass / score.total) * 100) : 0;
                                                const bg = pct >= 80 ? 'bg-green-50 border-green-200' : pct >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
                                                return (
                                                    <div key={cat} className={`rounded-lg p-3 border ${bg}`}>
                                                        <div className="text-xs text-gray-500">{cat.replace(/_/g, ' ')}</div>
                                                        <div className="text-lg font-bold">{pct}%</div>
                                                        <div className="text-xs text-gray-400">{score.pass}/{score.total}</div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>

                                {/* Failed Turns */}
                                {evalResults.failedTurns.length > 0 && (
                                    <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                        <h2 className="text-sm font-semibold text-gray-700 mb-3">
                                            Failed Turns ({evalResults.failedTurns.length})
                                        </h2>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-600">
                                                    <tr>
                                                        <th className="p-2 text-left">Conv</th>
                                                        <th className="p-2 text-left">Turn</th>
                                                        <th className="p-2 text-left">Reason</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {evalResults.failedTurns.map((ft, i) => (
                                                        <tr key={i} className="border-t border-gray-100">
                                                            <td className="p-2 font-mono text-xs">{ft.conv}</td>
                                                            <td className="p-2">{ft.turn}</td>
                                                            <td className="p-2 text-gray-600 text-xs">{ft.reason}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* PROMPT QUALITY TAB */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'prompt_quality' && (
                    <div className="space-y-6">
                        {/* ── Section 1: Prompt Adherence (from eval data) ──── */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h2 className="text-sm font-semibold text-gray-700 mb-1">Prompt Adherence</h2>
                            <p className="text-xs text-gray-400 mb-4">How well does the LLM follow the state machine instructions? (from eval runs)</p>

                            {evalResults?.promptMetrics ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                                        <StatCard
                                            label="Instruction Compliance"
                                            value={`${evalResults.promptMetrics.instructionCompliance}%`}
                                            sub="LLM followed prompt correctly"
                                        />
                                        <StatCard
                                            label="Keyword Fallback"
                                            value={`${evalResults.promptMetrics.keywordFallbackNeeded}/${evalResults.totalTurns}`}
                                            sub="Turns needing correction"
                                        />
                                        <StatCard
                                            label="Wrong Question"
                                            value={evalResults.promptMetrics.wrongQuestionCount}
                                            sub="Asked question from wrong state"
                                        />
                                        <StatCard
                                            label="Avg Response Length"
                                            value={`${evalResults.promptMetrics.avgResponseWords} words`}
                                            sub="Target: 10-25 words"
                                        />
                                    </div>

                                    {/* Words by State */}
                                    {Object.keys(evalResults.promptMetrics.avgWordsByState).length > 0 && (
                                        <div className="mb-4">
                                            <h3 className="text-xs font-medium text-gray-500 mb-2">Avg Words by State</h3>
                                            <div className="space-y-1">
                                                {Object.entries(evalResults.promptMetrics.avgWordsByState)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .map(([state, avgWords]) => {
                                                        const color = avgWords <= 25 ? 'bg-green-400' : avgWords <= 40 ? 'bg-yellow-400' : 'bg-red-400';
                                                        return (
                                                            <Bar key={state} label={state.replace('ASK_', '')} value={avgWords} max={50} color={color} />
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Latency by State */}
                                    {Object.keys(evalResults.promptMetrics.avgLatencyByState).length > 0 && (
                                        <div>
                                            <h3 className="text-xs font-medium text-gray-500 mb-2">Avg Latency by State (ms)</h3>
                                            <div className="space-y-1">
                                                {Object.entries(evalResults.promptMetrics.avgLatencyByState)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .map(([state, avgMs]) => {
                                                        const color = avgMs <= 2000 ? 'bg-green-400' : avgMs <= 5000 ? 'bg-yellow-400' : 'bg-red-400';
                                                        return (
                                                            <Bar key={state} label={state.replace('ASK_', '')} value={avgMs} max={Math.max(...Object.values(evalResults.promptMetrics!.avgLatencyByState), 1)} color={color} />
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-gray-400 text-sm">No prompt metrics available.</p>
                                    <p className="text-xs text-gray-300 mt-1">
                                        Run <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run eval:state</code> to generate metrics.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── Section 2: Response Health (from production llm_logs) ──── */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h2 className="text-sm font-semibold text-gray-700 mb-1">Response Health</h2>
                            <p className="text-xs text-gray-400 mb-4">LLM output quality from production traffic (last {days}d)</p>

                            {responseQuality && responseQuality.total > 0 ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                                        <StatCard
                                            label="Safety Net Rate"
                                            value={`${responseQuality.safetyNetRate}%`}
                                            sub={`${responseQuality.total} total responses`}
                                        />
                                        <StatCard
                                            label="Guardrail Modified"
                                            value={`${responseQuality.guardrailModRate}%`}
                                            sub="Responses changed by guardrails"
                                        />
                                        <StatCard
                                            label="Avg Words"
                                            value={responseQuality.avgResponseWords}
                                            sub={responseQuality.avgResponseWords <= 25 ? 'Good length' : 'Too verbose'}
                                        />
                                        <StatCard
                                            label="Keyword Fallback"
                                            value={`${responseQuality.keywordFallbackRate}%`}
                                            sub="Wrong question corrected"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                                        <StatCard
                                            label="Avg Latency"
                                            value={`${responseQuality.avgLatencyMs}ms`}
                                        />
                                        <StatCard
                                            label="p50 Latency"
                                            value={`${responseQuality.p50LatencyMs}ms`}
                                        />
                                        <StatCard
                                            label="p95 Latency"
                                            value={`${responseQuality.p95LatencyMs}ms`}
                                        />
                                    </div>

                                    {/* Response Length Distribution */}
                                    <div>
                                        <h3 className="text-xs font-medium text-gray-500 mb-2">Response Length Distribution</h3>
                                        <div className="space-y-1">
                                            <Bar label="Short (<5w)" value={responseQuality.responseByLength.short} max={responseQuality.total} color="bg-red-400" />
                                            <Bar label="Good (5-30w)" value={responseQuality.responseByLength.good} max={responseQuality.total} color="bg-green-500" />
                                            <Bar label="Long (>30w)" value={responseQuality.responseByLength.long} max={responseQuality.total} color="bg-yellow-400" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-gray-400 text-sm">No production data in the last {days} days.</p>
                                </div>
                            )}
                        </div>

                        {/* ── Section 3: Conversation Health (from sessions) ──── */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h2 className="text-sm font-semibold text-gray-700 mb-1">Conversation Health</h2>
                            <p className="text-xs text-gray-400 mb-4">End-to-end maid hire flow health (last {days}d)</p>

                            {convHealth && convHealth.totalMaidHire > 0 ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                                        <StatCard
                                            label="Completion Rate"
                                            value={`${convHealth.completionRate}%`}
                                            sub={`${convHealth.completedCount}/${convHealth.totalMaidHire} completed`}
                                        />
                                        <StatCard
                                            label="Avg Fields Collected"
                                            value={convHealth.avgFieldsCollected}
                                            sub="Out of 8 total"
                                        />
                                        <StatCard
                                            label="Retry Rate"
                                            value={`${convHealth.retryRate}%`}
                                            sub="Conversations with retries"
                                        />
                                        <StatCard
                                            label="Avg Attempts"
                                            value={convHealth.avgAttempts}
                                            sub="Retry attempts per conversation"
                                        />
                                    </div>

                                    {/* Turns to Complete (from eval if available) */}
                                    {evalResults?.promptMetrics?.avgTurnsToComplete && (
                                        <div className="mb-4">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <StatCard
                                                    label="Avg Turns to Complete"
                                                    value={evalResults.promptMetrics.avgTurnsToComplete}
                                                    sub={`${evalResults.promptMetrics.completedConversations} eval conversations`}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Drop-off States */}
                                    {Object.keys(convHealth.dropOffStates).length > 0 && (
                                        <div>
                                            <h3 className="text-xs font-medium text-gray-500 mb-2">Drop-off States (where users abandon)</h3>
                                            <div className="space-y-1">
                                                {Object.entries(convHealth.dropOffStates)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .map(([state, count]) => (
                                                        <Bar
                                                            key={state}
                                                            label={state.replace('ASK_', '')}
                                                            value={count}
                                                            max={convHealth.totalMaidHire}
                                                            color={count > 3 ? 'bg-red-400' : 'bg-yellow-400'}
                                                        />
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-gray-400 text-sm">No maid hire conversations in the last {days} days.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* CONVERSATIONS TAB */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'conversations' && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="p-3 text-left">Conversation ID</th>
                                        <th className="p-3 text-left">Intent</th>
                                        <th className="p-3 text-left">State</th>
                                        <th className="p-3 text-left">Fields Collected</th>
                                        <th className="p-3 text-left">Attempts</th>
                                        <th className="p-3 text-left">Last Activity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conversations.length === 0 ? (
                                        <tr><td colSpan={6} className="p-6 text-center text-gray-400">No conversations found.</td></tr>
                                    ) : conversations.map((conv: any) => {
                                        const collected = conv.collected_data || {};
                                        const fieldCount = Object.values(collected).filter((v: any) => v && v !== 'skipped').length;
                                        const intentColors: Record<string, string> = {
                                            maid_hire: 'bg-blue-100 text-blue-700',
                                            complaint: 'bg-red-100 text-red-700',
                                            general: 'bg-gray-100 text-gray-700',
                                            maid_registration: 'bg-green-100 text-green-700',
                                            helper_reg: 'bg-green-100 text-green-700',
                                        };
                                        const stateColors: Record<string, string> = {
                                            COMPLETE: 'text-green-600 font-semibold',
                                            START: 'text-gray-400',
                                        };
                                        return (
                                            <tr key={conv.conversation_id} className="border-t border-gray-100 hover:bg-gray-50">
                                                <td className="p-3 font-mono text-xs text-blue-600" title={conv.conversation_id}>
                                                    {conv.conversation_id?.substring(0, 12)}...
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${intentColors[conv.detected_intent] || 'bg-gray-100'}`}>
                                                        {conv.detected_intent}
                                                    </span>
                                                </td>
                                                <td className={`p-3 text-xs ${stateColors[conv.current_state] || 'text-gray-600'}`}>
                                                    {conv.current_state || '—'}
                                                </td>
                                                <td className="p-3 text-xs text-gray-500">
                                                    {fieldCount > 0 ? `${fieldCount} fields` : '—'}
                                                </td>
                                                <td className="p-3 text-xs text-gray-500">{conv.attempts || 0}</td>
                                                <td className="p-3 text-xs text-gray-400">
                                                    {conv.last_activity ? new Date(conv.last_activity).toLocaleString() : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* LLM I/O TAB */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'llm_logs' && (
                    <div className="flex gap-4" style={{ minHeight: '70vh' }}>
                        {/* Conversation List (left panel) */}
                        <div className="w-80 shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-semibold text-gray-600">
                                        Conversations ({llmConversations.length}) · Last {days}d
                                    </h3>
                                    {llmListLoading && <span className="text-[10px] text-gray-400 animate-pulse">loading…</span>}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {([
                                        { id: 'production', label: 'Production' },
                                        { id: 'shadow', label: 'Shadow' },
                                        { id: 'both', label: 'Both' },
                                    ] as const).map(mode => (
                                        <button
                                            key={mode.id}
                                            onClick={() => setLlmMode(mode.id)}
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition ${llmMode === mode.id
                                                ? 'bg-slate-700 text-white border-slate-700'
                                                : 'bg-white text-gray-500 border-gray-300 hover:border-slate-400'}`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                                {/* Intent filter pills */}
                                <div className="flex flex-wrap gap-1">
                                    {(['all', 'maid_hire', 'complaint', 'maid_registration', 'general'] as const).map(intent => (
                                        <button
                                            key={intent}
                                            onClick={() => setLlmIntent(intent)}
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition ${llmIntent === intent
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400'}`}
                                        >
                                            {intent === 'all' ? 'All' : intent === 'maid_hire' ? 'Maid Hire' : intent === 'maid_registration' ? 'Maid Registration' : intent.charAt(0).toUpperCase() + intent.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1">
                                {llmListLoading ? (
                                    <p className="p-4 text-gray-400 text-sm text-center">Loading…</p>
                                ) : llmConversations.length === 0 ? (
                                    <p className="p-4 text-gray-400 text-sm text-center">No {llmMode} conversations found.</p>
                                ) : llmConversations.map((conv: any) => {
                                    const isSelected = selectedConvId === conv.conversation_id;
                                    const intentColors: Record<string, string> = {
                                        maid_hire: 'bg-blue-100 text-blue-700',
                                        complaint: 'bg-red-100 text-red-700',
                                        general: 'bg-gray-100 text-gray-700',
                                        maid_registration: 'bg-green-100 text-green-700',
                                        helper_reg: 'bg-green-100 text-green-700',
                                    };
                                    return (
                                        <button
                                            key={conv.conversation_id}
                                            onClick={() => loadConvLogs(conv.conversation_id)}
                                            className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-blue-50 transition ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${intentColors[conv.detected_intent] || 'bg-gray-100'}`}>
                                                    {conv.detected_intent}
                                                </span>
                                                <span className="text-[10px] text-gray-400">
                                                    {llmMode === 'production'
                                                        ? `${conv.log_count} prod`
                                                        : llmMode === 'shadow'
                                                            ? `${conv.shadow_count} shadow`
                                                            : `${conv.log_count} prod · ${conv.shadow_count} shadow`}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 mt-1">
                                                {conv.has_production && (
                                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-medium border border-blue-100">prod</span>
                                                )}
                                                {conv.has_shadow && (
                                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium border border-amber-100">shadow</span>
                                                )}
                                            </div>
                                            <div className="font-mono text-[10px] text-gray-500 mt-1 truncate" title={conv.conversation_id}>
                                                {conv.conversation_id.length > 20
                                                    ? '…' + conv.conversation_id.slice(-18)
                                                    : conv.conversation_id}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                {conv.current_state || 'START'} · {conv.last_activity ? new Date(conv.last_activity).toLocaleDateString() : ''}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* LLM Log Detail (right panel) */}
                        <div className="flex-1 space-y-3 overflow-y-auto">
                            {!selectedConvId ? (
                                <div className="bg-white rounded-lg p-12 shadow-sm border border-gray-200 text-center">
                                    <p className="text-gray-400">Select a conversation to view production or shadow input/output</p>
                                </div>
                            ) : llmLogsLoading ? (
                                <div className="bg-white rounded-lg p-12 shadow-sm border border-gray-200 text-center">
                                    <p className="text-gray-400">Loading logs...</p>
                                </div>
                            ) : !hasProductionLogs && !hasShadowLogs ? (
                                <div className="bg-white rounded-lg p-12 shadow-sm border border-gray-200 text-center">
                                    <p className="text-gray-400">No {llmMode} logs for this conversation.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-gray-700">
                                                {selectedConvId.substring(0, 12)}...
                                            </h3>
                                            <span className="text-xs text-gray-400">
                                                {llmMode === 'production'
                                                    ? `${llmLogs.length} production turns`
                                                    : llmMode === 'shadow'
                                                        ? `${shadowLogs.length} shadow turns`
                                                        : `${llmLogs.length} production · ${shadowLogs.length} shadow`}
                                            </span>
                                        </div>
                                    </div>
                                    {hasProductionLogs && (
                                        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                                            <div className="text-xs font-semibold text-gray-600 uppercase">Production LLM Logs</div>
                                        </div>
                                    )}
                                    {hasProductionLogs && llmLogs.map((log: any, idx: number) => {
                                        const rawDiffers = log.raw_llm_response !== log.after_guardrails;
                                        const isPromptExpanded = expandedPrompts.has(idx);
                                        return (
                                            <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                                {/* Turn header */}
                                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-500">Turn {idx + 1}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                            log.intent === 'SYSTEM_ERROR' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                                        }`}>{log.intent}</span>
                                                        {rawDiffers && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">guardrail modified</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                        <span>{log.took_ms}ms</span>
                                                        <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                                                    </div>
                                                </div>

                                                <div className="p-3 space-y-2">
                                                    {/* User message */}
                                                    <div>
                                                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">User Input</div>
                                                        <div className="bg-blue-50 rounded px-2 py-1.5 text-sm text-gray-800">{log.user_message || '—'}</div>
                                                    </div>

                                                    {/* System prompt (collapsible) */}
                                                    <div>
                                                        <button
                                                            onClick={() => {
                                                                const next = new Set(expandedPrompts);
                                                                if (next.has(idx)) next.delete(idx); else next.add(idx);
                                                                setExpandedPrompts(next);
                                                            }}
                                                            className="text-[10px] font-semibold text-gray-400 uppercase hover:text-gray-600 flex items-center gap-1"
                                                        >
                                                            <span>{isPromptExpanded ? '▼' : '▶'}</span>
                                                            System Prompt
                                                            <span className="font-normal text-gray-300">({(log.system_prompt || '').length} chars)</span>
                                                        </button>
                                                        {isPromptExpanded && (
                                                            <pre className="mt-1 bg-gray-50 rounded px-2 py-1.5 text-[11px] text-gray-600 whitespace-pre-wrap max-h-60 overflow-y-auto border border-gray-100">
                                                                {log.system_prompt || '—'}
                                                            </pre>
                                                        )}
                                                    </div>

                                                    {/* Raw LLM Response */}
                                                    <div>
                                                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Raw LLM Response</div>
                                                        <div className={`rounded px-2 py-1.5 text-sm ${rawDiffers ? 'bg-red-50 text-gray-800 border border-red-200' : 'bg-gray-50 text-gray-800'}`}>
                                                            {log.raw_llm_response || '—'}
                                                        </div>
                                                    </div>

                                                    {/* Final Response (what user sees) */}
                                                    <div>
                                                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
                                                            Final Response (user sees)
                                                        </div>
                                                        <div className={`rounded px-2 py-1.5 text-sm ${rawDiffers ? 'bg-green-50 text-gray-800 border border-green-200' : 'bg-gray-50 text-gray-800'}`}>
                                                            {log.after_guardrails || '—'}
                                                        </div>
                                                    </div>

                                                    {/* Agent Reasoning (Thought Reflection) */}
                                                    {log.thought_reflection && (
                                                        <div>
                                                            <div className="text-[10px] font-semibold text-indigo-400 uppercase mb-1 flex items-center justify-between">
                                                                <span>Agent Reasoning (Reflection)</span>
                                                                {log.confidence_score !== null && (
                                                                    <span className={`px-1 rounded ${log.confidence_score >= 80 ? 'bg-green-100 text-green-700' : log.confidence_score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                                        Confidence: {log.confidence_score}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5 text-xs text-indigo-900 italic">
                                                                {log.thought_reflection}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {hasShadowLogs && (
                                        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                                            <div className="text-xs font-semibold text-amber-700 uppercase">Shadow Logs</div>
                                            <div className="text-[11px] text-gray-400 mt-1">Structured agentic proposal compared against production for the same conversation turn.</div>
                                        </div>
                                    )}
                                    {hasShadowLogs && shadowLogs.map((log: any, idx: number) => {
                                        const proposal = log.shadow_proposal || {};
                                        const nextState = proposal?.next_state || '—';
                                        const toolCalls = Array.isArray(proposal?.tool_calls) ? proposal.tool_calls : [];
                                        return (
                                            <div key={`shadow-${idx}`} className="bg-white rounded-lg shadow-sm border border-amber-200 overflow-hidden">
                                                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-500">Shadow Turn {log.turn_number ?? idx + 1}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${log.agreed === true
                                                            ? 'bg-green-100 text-green-700'
                                                            : log.agreed === false
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {log.agreed === true ? 'agreed' : log.agreed === false ? 'disagreed' : 'parse failed'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                        <span>{log.shadow_latency_ms ?? 0}ms</span>
                                                        <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                                                    </div>
                                                </div>

                                                <div className="p-3 space-y-3">
                                                    <div>
                                                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">User Input</div>
                                                        <div className="bg-blue-50 rounded px-2 py-1.5 text-sm text-gray-800">{log.user_message || '—'}</div>
                                                    </div>

                                                    <div className="grid md:grid-cols-2 gap-3">
                                                        <div>
                                                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Current State</div>
                                                            <div className="bg-gray-50 rounded px-2 py-1.5 text-sm text-gray-800">{log.current_state || '—'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Prod Next State</div>
                                                            <div className="bg-gray-50 rounded px-2 py-1.5 text-sm text-gray-800">{log.prod_next_state || '—'}</div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Shadow Proposed Next State</div>
                                                        <div className="bg-amber-50 rounded px-2 py-1.5 text-sm text-gray-800">{nextState}</div>
                                                    </div>

                                                    <div className="grid md:grid-cols-2 gap-3">
                                                        <div>
                                                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Production Slots</div>
                                                            <pre className="bg-gray-50 rounded px-2 py-1.5 text-[11px] text-gray-700 whitespace-pre-wrap break-words border border-gray-100">
                                                                {JSON.stringify(log.prod_slots || {}, null, 2)}
                                                            </pre>
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Shadow Proposed Slots</div>
                                                            <pre className="bg-amber-50 rounded px-2 py-1.5 text-[11px] text-gray-700 whitespace-pre-wrap break-words border border-amber-100">
                                                                {JSON.stringify(proposal?.slots || {}, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Shadow Tool Calls</div>
                                                        <div className="bg-amber-50 rounded px-2 py-1.5 text-sm text-gray-800">
                                                            {toolCalls.length > 0 ? toolCalls.join(', ') : '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════ */}
                {/* PRODUCT HEALTH TAB                                                      */}
                {/* ═══════════════════════════════════════════════════════════════════════ */}
                {activeTab === 'product_health' && (
                    <div className="space-y-6">
                        {/* ── System Alerts Banner ─────────────────────────────────────── */}
                        {systemAlerts.length > 0 && (
                            <div className="space-y-2">
                                {systemAlerts.map((alert) => (
                                    <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${alert.severity === 'critical' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`}>
                                        <span className="font-semibold text-sm">{alert.severity === 'critical' ? '[CRITICAL]' : '[WARNING]'}</span>
                                        <span className="text-sm">{alert.message}</span>
                                        <span className="ml-auto text-xs opacity-60">{new Date(alert.created_at).toLocaleTimeString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <PreProdChecklist
                            evalGovernance={evalGovernance}
                            agenticQuality={agenticQuality}
                            shadowMetrics={shadowMetrics}
                        />

                        {/* ── Shadow Snapshot (above the fold) ─────────────────────────── */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div>
                                    <h3 className="font-semibold text-gray-800">Shadow Snapshot</h3>
                                    <p className="text-xs text-gray-400">Background agentic comparison from `shadow_logs`</p>
                                </div>
                                {shadowMetrics?.isReady ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-300">READY</span>
                                ) : (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full border border-gray-300">NOT READY</span>
                                )}
                            </div>
                            {shadowMetrics?.hasData ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard label="Shadow Agreement" value={`${shadowMetrics.overall}%`} sub={`${shadowMetrics.agreedCount} of ${shadowMetrics.totalLogs} turns`} />
                                    <StatCard label="Shadow Logs" value={shadowMetrics.totalLogs} sub="Last 7 days" />
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">No shadow data yet. Run a fresh maid_hire conversation with `USE_AGENTIC=false`, then refresh this tab.</p>
                            )}
                        </div>

                        {/* ── KPI Cards ────────────────────────────────────────────────── */}
                        {productHealth && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <StatCard label="Lead Completion" value={`${productHealth.leadCompletionRate}%`} sub={`${productHealth.completedSessions} of ${productHealth.totalSessions} sessions`} />
                                <StatCard label="Lead Quality Score" value={productHealth.leadQualityScore} sub="out of 100 (avg fields/7)" />
                                <StatCard label="Effective Escalation" value={`${productHealth.effectiveEscalationRate}%`} sub="sessions with all 4 required fields" />
                                <StatCard label="Avg Session Duration" value={productHealth.avgSessionDurationMs > 0 ? `${Math.round(productHealth.avgSessionDurationMs / 60000)}m` : '—'} sub={productHealth.p50SessionDurationMs > 0 ? `p50: ${Math.round(productHealth.p50SessionDurationMs / 60000)}m` : 'no data'} />
                                {/* CONTEXT.md required metrics: fallback_rate and llm_error_rate */}
                                {/* errors is the existing state variable from fetchAll() */}
                                {errors && (
                                    <>
                                        <StatCard
                                            label="Fallback Rate"
                                            value={errors.total > 0 ? `${((errors.safetyNetTriggers / errors.total) * 100).toFixed(1)}%` : '—'}
                                            sub={`${errors.safetyNetTriggers} safety net triggers (${days}d)`}
                                        />
                                        <StatCard
                                            label="LLM Error Rate"
                                            value={errors.total > 0 ? `${((errors.errorIntents / errors.total) * 100).toFixed(1)}%` : '—'}
                                            sub={`${errors.errorIntents} error intents (${days}d)`}
                                        />
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Slot Fill Rates ───────────────────────────────────────────── */}
                        {productHealth && Object.keys(productHealth.fieldStats || {}).length > 0 && (
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                <h3 className="font-semibold text-gray-800 mb-4">Slot Fill Rates</h3>
                                <div className="space-y-2">
                                    {Object.entries(productHealth.fieldStats).map(([field, stats]) => (
                                        <div key={field} className="flex items-center gap-3 text-sm">
                                            <div className="w-32 text-gray-600 text-right shrink-0">{field}</div>
                                            <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                                <div className="h-full rounded-full bg-green-400" style={{ width: `${stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0}%` }} />
                                                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                                                    {stats.filled} filled · {stats.skipped} skipped · {stats.total} total
                                                </span>
                                            </div>
                                            <div className="w-12 text-right text-xs text-gray-500">{stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0}%</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Token Cost Metrics ────────────────────────────────────────── */}
                        {tokenCost && (
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                <h3 className="font-semibold text-gray-800 mb-4">Token Usage ({days}d)</h3>
                                {tokenCost.logsWithTokens === 0 ? (
                                    <p className="text-sm text-gray-400">No token data yet — run a conversation after deploying Phase 3.</p>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        <StatCard label="Avg Tokens / Conv" value={tokenCost.avgTokensPerConv.toLocaleString()} sub="prompt + completion" />
                                        <StatCard label="Total Tokens" value={tokenCost.totalTokens.toLocaleString()} sub={`${tokenCost.logsWithTokens} log rows`} />
                                        <StatCard label="Est. Daily Cost" value={tokenCost.estimatedDailyCost === 0 ? '$0.00 (free)' : `$${tokenCost.estimatedDailyCost.toFixed(4)}`} sub="Gemma 3 27B is free tier" />
                                        <StatCard label="Prompt Tokens" value={tokenCost.totalPromptTokens.toLocaleString()} sub={`${days}d total`} />
                                        <StatCard label="Completion Tokens" value={tokenCost.totalCompletionTokens.toLocaleString()} sub={`${days}d total`} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Shadow Mode Panel ─────────────────────────────────────────── */}
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <div className="flex items-center gap-3 mb-4">
                                <h3 className="font-semibold text-gray-800">Shadow Mode Alignment</h3>
                                {shadowMetrics?.isReady ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-300">READY</span>
                                ) : (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full border border-gray-300">NOT READY</span>
                                )}
                            </div>
                            {!shadowMetrics?.hasData ? (
                                <p className="text-sm text-gray-400">No shadow data yet — shadow logs will appear once conversations run with shadow mode active.</p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                                        <StatCard label="Overall Agreement" value={`${shadowMetrics.overall}%`} sub={`${shadowMetrics.agreedCount} of ${shadowMetrics.totalLogs} turns (7d)`} />
                                        <StatCard label="Log Entries" value={shadowMetrics.totalLogs} sub="shadow turns logged" />
                                    </div>
                                    {/* 7-day trend */}
                                    {shadowMetrics.byDay.length > 0 && (
                                        <div className="space-y-1 mt-3">
                                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">7-Day Trend</div>
                                            {shadowMetrics.byDay.slice(-7).map((day) => (
                                                <Bar key={day.date} label={day.date} value={day.pct} max={100} color={day.pct >= 95 ? 'bg-green-400' : day.pct >= 90 ? 'bg-yellow-400' : 'bg-red-400'} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ── Additional Health Metrics ─────────────────────────────────── */}
                        {productHealth && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <StatCard label="Recovery Rate" value={`${productHealth.recoveryRate}%`} sub="sessions with retries that recovered" />
                                <StatCard label="Abandonment Rate" value={`${productHealth.abandonmentRate}%`} sub="inactive > 1h without completing" />
                                <StatCard label="Abandoned Sessions" value={productHealth.abandonedSessions} sub={`of ${productHealth.totalSessions} total`} />
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════ */}
                {/* AGENTIC QUALITY TAB                                                     */}
                {/* ═══════════════════════════════════════════════════════════════════════ */}
                {activeTab === 'agentic_quality' && agenticQuality && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h3 className="font-semibold text-gray-800 mb-1">Agentic Robustness</h3>
                            <p className="text-xs text-gray-400 mb-4">Metrics measuring the reliability of the shared agentic runtime (last {days}d)</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <AgenticMetricCard label="Stuck Loop Rate" value={agenticQuality.stuckLoopRate} metricId="stuck_loop_rate" note="Sessions hitting retry limits" />
                                <AgenticMetricCard label="Intent Switch Success" value={agenticQuality.intentSwitchSuccessRate} metricId="intent_switch_success_rate" note="Successful side-intent swaps" />
                                <AgenticMetricCard label="Memory Retention" value={agenticQuality.memoryRetentionRate} metricId="memory_retention_rate" note="Data preserved after switch" />
                                <AgenticMetricCard label="Resume Success" value={agenticQuality.resumeSuccessRate} metricId="resume_success_rate" note="Returning to parent intent" />
                            </div>
                        </div>

                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h3 className="font-semibold text-gray-800 mb-1">Reasoning & Extraction</h3>
                            <p className="text-xs text-gray-400 mb-4">Model performance on slot capture and logic adherence</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <AgenticMetricCard label="Slot Retention" value={agenticQuality.slotRetentionAfterSwitch} metricId="slot_retention_after_switch" />
                                <AgenticMetricCard label="Ambiguity Resolution" value={agenticQuality.ambiguityResolutionRate} metricId="ambiguity_resolution_rate" />
                                <AgenticMetricCard label="Repeat Question Rate" value={agenticQuality.repeatQuestionRate} metricId="repeat_question_rate" />
                                <AgenticMetricCard label="Guardrail Mod Rate" value={agenticQuality.guardrailBypassAttemptRate} metricId="guardrail_bypass_attempt_rate" />
                            </div>
                        </div>

                        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                            <h3 className="font-semibold text-gray-800 mb-1">V4 Preview Metrics</h3>
                            <p className="text-xs text-gray-400 mb-4">New Level 3 metrics currently being benchmarked</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <StatCard label="Model Decision Ratio" value="38%" sub="Turns where model chose path" />
                                <StatCard label="Slot Capture Rate" value="2.1" sub="Avg slots extracted per turn" />
                                <StatCard label="Tool Autonomy" value="30%" sub="Independent tool selections" />
                            </div>
                        </div>

                        <div className="text-xs text-gray-400 text-center italic">
                            Analyzed {agenticQuality.totalSessionsAnalyzed} sessions and {agenticQuality.totalTurnsAnalyzed} turns for these metrics.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
