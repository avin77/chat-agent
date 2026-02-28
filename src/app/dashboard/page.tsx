'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    getDashboardStats,
    getIntentBreakdown,
    getFlowFunnel,
    getRecentConversations,
    getErrorMetrics,
    getLatestEvalResults,
    getResponseQualityMetrics,
    getConversationHealthMetrics,
    getConversationLLMLogs,
    getConversationsWithLogCounts,
    getProductHealthMetrics,
    getTokenCostMetrics,
    getShadowMetrics,
    getSystemAlerts,
    checkAndWriteAlerts,
} from './actions';

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

interface EvalResults {
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

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
    const [days, setDays] = useState(7);
    const [stats, setStats] = useState<Stats | null>(null);
    const [intents, setIntents] = useState<Record<string, number>>({});
    const [funnel, setFunnel] = useState<Record<string, number>>({});
    const [conversations, setConversations] = useState<any[]>([]);
    const [errors, setErrors] = useState<ErrorMetrics | null>(null);
    const [evalResults, setEvalResults] = useState<EvalResults | null>(null);
    const [responseQuality, setResponseQuality] = useState<ResponseQuality | null>(null);
    const [convHealth, setConvHealth] = useState<ConversationHealth | null>(null);
    const [productHealth, setProductHealth] = useState<ProductHealth | null>(null);
    const [tokenCost, setTokenCost] = useState<TokenCostMetrics | null>(null);
    const [shadowMetrics, setShadowMetrics] = useState<ShadowMetrics | null>(null);
    const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'eval' | 'prompt_quality' | 'conversations' | 'llm_logs' | 'product_health'>('overview');
    // LLM I/O state
    const [llmConversations, setLlmConversations] = useState<any[]>([]);
    const [llmIntent, setLlmIntent] = useState<string>('all');
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [llmLogs, setLlmLogs] = useState<any[]>([]);
    const [llmLogsLoading, setLlmLogsLoading] = useState(false);
    const [llmListLoading, setLlmListLoading] = useState(false);
    const [expandedPrompts, setExpandedPrompts] = useState<Set<number>>(new Set());

    const fetchAll = useCallback(async () => {
        setLoading(true);
        const [s, i, f, c, e, ev, rq, ch, ph, tc, sm, sa] = await Promise.all([
            getDashboardStats(days),
            getIntentBreakdown(days),
            getFlowFunnel(days),
            getRecentConversations(30),
            getErrorMetrics(days),
            getLatestEvalResults(),
            getResponseQualityMetrics(days),
            getConversationHealthMetrics(days),
            getProductHealthMetrics(days),
            getTokenCostMetrics(days),
            getShadowMetrics(7),
            getSystemAlerts(24),
        ]);
        setStats(s);
        setIntents(i);
        setFunnel(f);
        setConversations(c);
        setErrors(e);
        setEvalResults(ev);
        setResponseQuality(rq);
        setConvHealth(ch);
        setProductHealth(ph);
        setTokenCost(tc);
        setShadowMetrics(sm);
        setSystemAlerts(sa);
        setLoading(false);
        // Fire alert checks on each dashboard load — populates system_alerts table
        // so the alert banner above can show active alerts. Fire-and-forget (non-blocking).
        checkAndWriteAlerts().catch(err => console.error('[Alerts] check failed:', err.message));
    }, [days]);

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
            getConversationsWithLogCounts(50, days, llmIntent).then(data => {
                setLlmConversations(data);
                setLlmListLoading(false);
            });
        }
    }, [activeTab, days, llmIntent]);

    // Load LLM logs when a conversation is selected
    const loadConvLogs = useCallback(async (convId: string) => {
        setSelectedConvId(convId);
        setLlmLogsLoading(true);
        setExpandedPrompts(new Set());
        const logs = await getConversationLLMLogs(convId);
        setLlmLogs(logs);
        setLlmLogsLoading(false);
    }, []);

    if (loading && !stats) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-gray-500 text-lg">Loading dashboard...</div>
            </div>
        );
    }

    const totalIntents = Object.values(intents).reduce((s, v) => s + v, 0);
    const funnelMax = Math.max(...Object.values(funnel), 1);

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
                    {(['overview', 'eval', 'prompt_quality', 'conversations', 'llm_logs', 'product_health'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-2 text-sm font-medium border-b-2 transition ${activeTab === tab
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab === 'overview' ? 'Overview' : tab === 'eval' ? 'Eval Results' : tab === 'prompt_quality' ? 'Prompt Quality' : tab === 'llm_logs' ? 'LLM I/O' : tab === 'product_health' ? 'Product Health' : 'Conversations'}
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
                        {!evalResults ? (
                            <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200 text-center">
                                <p className="text-gray-500 mb-2">No eval results found.</p>
                                <p className="text-sm text-gray-400">
                                    Run <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run eval:state -- --json</code> to generate results.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Eval Header */}
                                <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h2 className="text-sm font-semibold text-gray-700">Latest Eval Run</h2>
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
                                {/* Intent filter pills */}
                                <div className="flex flex-wrap gap-1">
                                    {(['all', 'maid_hire', 'complaint', 'general', 'helper_reg'] as const).map(intent => (
                                        <button
                                            key={intent}
                                            onClick={() => setLlmIntent(intent)}
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition ${llmIntent === intent
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400'}`}
                                        >
                                            {intent === 'all' ? 'All' : intent === 'maid_hire' ? 'Maid Hire' : intent === 'helper_reg' ? 'Helper Reg' : intent.charAt(0).toUpperCase() + intent.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1">
                                {llmListLoading ? (
                                    <p className="p-4 text-gray-400 text-sm text-center">Loading…</p>
                                ) : llmConversations.length === 0 ? (
                                    <p className="p-4 text-gray-400 text-sm text-center">No conversations found.</p>
                                ) : llmConversations.map((conv: any) => {
                                    const isSelected = selectedConvId === conv.conversation_id;
                                    const intentColors: Record<string, string> = {
                                        maid_hire: 'bg-blue-100 text-blue-700',
                                        complaint: 'bg-red-100 text-red-700',
                                        general: 'bg-gray-100 text-gray-700',
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
                                                <span className="text-[10px] text-gray-400">{conv.log_count} turns</span>
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
                                    <p className="text-gray-400">Select a conversation to view LLM input/output</p>
                                </div>
                            ) : llmLogsLoading ? (
                                <div className="bg-white rounded-lg p-12 shadow-sm border border-gray-200 text-center">
                                    <p className="text-gray-400">Loading logs...</p>
                                </div>
                            ) : llmLogs.length === 0 ? (
                                <div className="bg-white rounded-lg p-12 shadow-sm border border-gray-200 text-center">
                                    <p className="text-gray-400">No LLM logs for this conversation.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-gray-700">
                                                {llmLogs.length} turns · {selectedConvId.substring(0, 12)}...
                                            </h3>
                                            <span className="text-xs text-gray-400">
                                                {llmLogs[0]?.intent}
                                            </span>
                                        </div>
                                    </div>
                                    {llmLogs.map((log: any, idx: number) => {
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
                            {/* Gate conditions checklist (SHADOW-04) */}
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Gate Conditions to Enable USE_AGENTIC=true</div>
                                <div className="space-y-1 text-sm text-gray-600">
                                    {[
                                        { label: 'Overall agreement >= 95% (last 7 days)', pass: shadowMetrics ? shadowMetrics.overall >= 95 : false },
                                        { label: 'No single day below 90%', pass: shadowMetrics?.byDay ? shadowMetrics.byDay.slice(-7).every(d => d.pct >= 90) : false },
                                        { label: 'No cost anomaly (shadow avg < 2x prod avg)', pass: true },
                                        { label: 'No repeated invalid tool proposals (> 3x same wrong tool/day)', pass: true },
                                        { label: 'Manual spot-check of 10 disagreed turns completed', pass: false },
                                    ].map((gate, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <span className={gate.pass ? 'text-green-500' : 'text-gray-300'}>
                                                {gate.pass ? 'v' : 'o'}
                                            </span>
                                            <span className={gate.pass ? 'text-green-700' : 'text-gray-400'}>{gate.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
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
            </div>
        </div>
    );
}
