'use server';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Summary Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [sessions, leads, complaints, helperRegs, logs] = await Promise.all([
        supabase.from('conversation_sessions').select('id', { count: 'exact', head: true }).gte('last_activity', since),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('complaints').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('helper_registrations').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('llm_logs').select('took_ms').gte('created_at', since),
    ]);

    const logData = logs.data || [];
    const latencies = logData.map((l: any) => l.took_ms).filter((v: any) => typeof v === 'number');
    latencies.sort((a: number, b: number) => a - b);

    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((s: number, v: number) => s + v, 0) / latencies.length) : 0;
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    return {
        totalConversations: sessions.count || 0,
        totalLeads: leads.count || 0,
        totalComplaints: complaints.count || 0,
        totalHelperRegs: helperRegs.count || 0,
        totalLLMCalls: logData.length,
        avgLatency,
        p50Latency: p50,
        p95Latency: p95,
    };
}

// ─── Intent Breakdown ───────────────────────────────────────────────────────
export async function getIntentBreakdown(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('conversation_sessions')
        .select('detected_intent')
        .gte('created_at', since);

    if (error || !data) return {};

    const counts: Record<string, number> = {};
    for (const row of data) {
        const intent = row.detected_intent || 'unknown';
        counts[intent] = (counts[intent] || 0) + 1;
    }
    return counts;
}

// ─── Flow Completion Funnel ─────────────────────────────────────────────────
export async function getFlowFunnel(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('conversation_sessions')
        .select('current_state')
        .eq('detected_intent', 'maid_hire')
        .gte('created_at', since);

    if (error || !data) return {};

    // Define state order for funnel
    const stateOrder = ['START', 'ASK_PHONE', 'ASK_LOCATION', 'ASK_SERVICE', 'ASK_SCHEDULE', 'ASK_SALARY', 'ASK_FAMILY', 'ASK_EXPERIENCE', 'COMPLETE'];
    const stateIndex: Record<string, number> = {};
    stateOrder.forEach((s, i) => { stateIndex[s] = i; });

    // Count how many sessions reached at least each state
    const funnel: Record<string, number> = {};
    for (const state of stateOrder) {
        funnel[state] = 0;
    }

    for (const row of data) {
        const currentState = row.current_state || 'START';
        const idx = stateIndex[currentState] ?? 0;
        // If session is at state X, it reached all states before X
        for (let i = 0; i <= idx; i++) {
            funnel[stateOrder[i]]++;
        }
    }

    return funnel;
}

// ─── Recent Conversations ───────────────────────────────────────────────────
export async function getRecentConversations(limit: number = 20) {
    const { data, error } = await supabase
        .from('conversation_sessions')
        .select('conversation_id, detected_intent, current_state, collected_data, attempts, created_at, last_activity')
        .order('last_activity', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data || [];
}

// ─── Safety Net & Error Metrics ─────────────────────────────────────────────
export async function getErrorMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('llm_logs')
        .select('raw_llm_response, after_guardrails, intent, took_ms')
        .gte('created_at', since);

    if (error || !data) return { safetyNetTriggers: 0, guardrailModified: 0, total: 0, errorIntents: 0 };

    let safetyNetTriggers = 0;
    let guardrailModified = 0;
    let errorIntents = 0;

    for (const row of data) {
        const raw = row.raw_llm_response || '';
        if (raw === '.' || raw.trim().length < 4) safetyNetTriggers++;
        if (raw !== row.after_guardrails) guardrailModified++;
        if (row.intent === 'SYSTEM_ERROR') errorIntents++;
    }

    return { safetyNetTriggers, guardrailModified, total: data.length, errorIntents };
}

// ─── Eval Results (from JSON files) ─────────────────────────────────────────
export async function getLatestEvalResults() {
    // Read latest eval JSON from data/ directory
    const fs = await import('fs');
    const path = await import('path');

    const dataDir = path.join(process.cwd(), 'data');

    try {
        const files = fs.readdirSync(dataDir)
            .filter((f: string) => f.startsWith('eval-state-') && f.endsWith('.json'))
            .sort()
            .reverse();

        if (files.length === 0) return null;

        const latest = JSON.parse(fs.readFileSync(path.join(dataDir, files[0]), 'utf-8'));
        return {
            timestamp: latest.timestamp,
            overallScore: latest.overallScore,
            verdict: latest.verdict,
            totalConversations: latest.totalConversations,
            totalTurns: latest.totalTurns,
            scores: latest.scores,
            categoryScores: latest.categoryScores,
            failedTurns: (latest.failedTurns || []).slice(0, 20), // limit for UI
            promptMetrics: latest.promptMetrics || null,
        };
    } catch {
        return null;
    }
}

// ─── Response Quality from LLM Logs (production data) ──────────────────────
export async function getResponseQualityMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('llm_logs')
        .select('raw_llm_response, after_guardrails, intent, took_ms, system_prompt')
        .eq('intent', 'maid_hire')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

    if (error || !data || data.length === 0) {
        return {
            total: 0,
            safetyNetRate: 0,
            guardrailModRate: 0,
            avgResponseWords: 0,
            avgLatencyMs: 0,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            keywordFallbackRate: 0,
            responseByLength: { short: 0, good: 0, long: 0 },
        };
    }

    let safetyNet = 0;
    let guardrailMod = 0;
    let totalWords = 0;
    let keywordFallback = 0;
    const latencies: number[] = [];
    const lengths = { short: 0, good: 0, long: 0 }; // <5 words, 5-30 words, >30 words

    for (const row of data) {
        const raw = row.raw_llm_response || '';
        const cleaned = row.after_guardrails || '';

        // Safety net
        if (raw === '.' || raw.trim().length < 4) safetyNet++;

        // Guardrail modification
        if (raw !== cleaned) guardrailMod++;

        // Word count
        const words = cleaned.split(/\s+/).filter((w: string) => w.length > 0).length;
        totalWords += words;

        if (words < 5) lengths.short++;
        else if (words <= 30) lengths.good++;
        else lengths.long++;

        // Keyword fallback detection (from system prompt — check if cleaned has the step question appended)
        // The keyword fallback appends the full step question, so if raw != cleaned and cleaned is longer,
        // it likely had the question appended
        if (cleaned.length > raw.length + 20) {
            keywordFallback++;
        }

        // Latency
        if (typeof row.took_ms === 'number') {
            latencies.push(row.took_ms);
        }
    }

    latencies.sort((a, b) => a - b);

    return {
        total: data.length,
        safetyNetRate: data.length > 0 ? Math.round((safetyNet / data.length) * 100) : 0,
        guardrailModRate: data.length > 0 ? Math.round((guardrailMod / data.length) * 100) : 0,
        avgResponseWords: data.length > 0 ? Math.round(totalWords / data.length) : 0,
        avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : 0,
        p50LatencyMs: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0,
        p95LatencyMs: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
        keywordFallbackRate: data.length > 0 ? Math.round((keywordFallback / data.length) * 100) : 0,
        responseByLength: lengths,
    };
}

// ─── Conversation Health Metrics ───────────────────────────────────────────
export async function getConversationHealthMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('conversation_sessions')
        .select('conversation_id, detected_intent, current_state, collected_data, attempts, created_at')
        .eq('detected_intent', 'maid_hire')
        .gte('created_at', since);

    if (error || !data || data.length === 0) {
        return {
            totalMaidHire: 0,
            completionRate: 0,
            avgAttempts: 0,
            retryRate: 0,
            dropOffStates: {} as Record<string, number>,
            completedCount: 0,
            avgFieldsCollected: 0,
        };
    }

    let completed = 0;
    let totalAttempts = 0;
    let retries = 0;
    let totalFields = 0;
    const dropOff: Record<string, number> = {};

    for (const row of data) {
        const state = row.current_state || 'START';
        const attempts = row.attempts || 0;
        const collected = row.collected_data || {};

        // Count fields collected (non-empty, non-skipped)
        const fieldCount = Object.values(collected).filter((v: any) => v && v !== 'skipped').length;
        totalFields += fieldCount;

        totalAttempts += attempts;
        if (attempts > 0) retries++;

        if (state === 'COMPLETE') {
            completed++;
        } else {
            // Drop-off state
            dropOff[state] = (dropOff[state] || 0) + 1;
        }
    }

    return {
        totalMaidHire: data.length,
        completionRate: data.length > 0 ? Math.round((completed / data.length) * 100) : 0,
        avgAttempts: data.length > 0 ? parseFloat((totalAttempts / data.length).toFixed(1)) : 0,
        retryRate: data.length > 0 ? Math.round((retries / data.length) * 100) : 0,
        dropOffStates: dropOff,
        completedCount: completed,
        avgFieldsCollected: data.length > 0 ? parseFloat((totalFields / data.length).toFixed(1)) : 0,
    };
}

// ─── LLM I/O Logs per Conversation ──────────────────────────────────────────
export async function getConversationLLMLogs(conversationId: string) {
    const { data, error } = await supabase
        .from('llm_logs')
        .select('created_at, intent, system_prompt, user_message, raw_llm_response, after_guardrails, took_ms')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);

    if (error || !data) return [];
    return data;
}

// ─── Recent Conversations with LLM log counts ──────────────────────────────
export async function getConversationsWithLogCounts(limit: number = 50, days: number = 7, intent?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get recent conversations with date + optional intent filter
    let query = supabase
        .from('conversation_sessions')
        .select('conversation_id, detected_intent, current_state, collected_data, last_activity')
        .gte('last_activity', since)
        .order('last_activity', { ascending: false })
        .limit(limit);

    if (intent && intent !== 'all') {
        query = query.eq('detected_intent', intent);
    }

    const { data: sessions, error: sessError } = await query;

    if (sessError || !sessions) return [];

    // Get log counts per conversation in one query
    const convIds = sessions.map((s: any) => s.conversation_id);
    const { data: logs } = await supabase
        .from('llm_logs')
        .select('conversation_id')
        .in('conversation_id', convIds);

    const logCounts: Record<string, number> = {};
    for (const log of (logs || [])) {
        logCounts[log.conversation_id] = (logCounts[log.conversation_id] || 0) + 1;
    }

    return sessions.map((s: any) => ({
        ...s,
        log_count: logCounts[s.conversation_id] || 0,
    }));
}

// ─── Product Health Metrics (TPM view) ──────────────────────────────────────
export async function getProductHealthMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get all maid_hire sessions in the period
    const { data: sessions, error } = await supabase
        .from('conversation_sessions')
        .select('conversation_id, current_state, collected_data, attempts, created_at, last_activity')
        .eq('detected_intent', 'maid_hire')
        .gte('created_at', since);

    if (error || !sessions) {
        return {
            leadCompletionRate: 0,
            leadQualityScore: 0,
            effectiveEscalationRate: 0,
            fieldFillRates: {},
            fieldStats: {},
            recoveryRate: 0,
            abandonmentRate: 0,
            avgSessionDurationMs: 0,
            p50SessionDurationMs: 0,
            totalSessions: 0,
            completedSessions: 0,
            abandonedSessions: 0,
        };
    }

    const REQUIRED_FIELDS = ['phone', 'location', 'service_type', 'schedule'];
    const ALL_FIELDS = ['phone', 'location', 'service_type', 'schedule', 'salary_range', 'family_size', 'has_experience'];

    let completed = 0;
    let totalFields = 0;
    let effectiveLeads = 0; // all 4 required fields
    let recoverable = 0; // sessions with attempts > 0
    let recovered = 0; // sessions with attempts > 0 that eventually completed
    let totalDurationMs = 0;
    let durationCount = 0;
    const ABANDON_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour inactive = abandoned
    let abandoned = 0;

    const fieldCounts: Record<string, number> = {};
    for (const f of ALL_FIELDS) fieldCounts[f] = 0;

    for (const row of sessions) {
        const state = row.current_state || 'START';
        const collected = row.collected_data || {};
        const attempts = row.attempts || 0;
        const createdAt = new Date(row.created_at).getTime();
        const lastActivity = new Date(row.last_activity || row.created_at).getTime();

        // Field fill rates
        const fieldCount = ALL_FIELDS.filter(f => collected[f] && collected[f] !== 'skipped').length;
        totalFields += fieldCount;
        for (const f of ALL_FIELDS) {
            if (collected[f] && collected[f] !== 'skipped') fieldCounts[f]++;
        }

        // Completion
        if (state === 'COMPLETE') {
            completed++;
            // Effective escalation: all 4 required fields present
            const hasAllRequired = REQUIRED_FIELDS.every(f => collected[f]);
            if (hasAllRequired) effectiveLeads++;
        } else {
            // Abandonment: not complete and inactive > 1h
            const isInactive = Date.now() - lastActivity > ABANDON_THRESHOLD_MS;
            if (isInactive) abandoned++;
        }

        // Recovery rate: after failures, did they recover?
        if (attempts > 0) {
            recoverable++;
            if (state === 'COMPLETE') recovered++;
        }

        // Session duration
        const durationMs = lastActivity - createdAt;
        if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) { // ignore outliers > 24h
            totalDurationMs += durationMs;
            durationCount++;
        }
    }

    const total = sessions.length;

    // Per-field detailed stats (DASH-05)
    const fieldDetailStats: Record<string, { filled: number; skipped: number; total: number }> = {};
    for (const f of ALL_FIELDS) {
        fieldDetailStats[f] = { filled: 0, skipped: 0, total: 0 };
    }
    for (const row of sessions) {
        const collected = row.collected_data || {};
        for (const f of ALL_FIELDS) {
            fieldDetailStats[f].total++;
            if (collected[f] === 'skipped') fieldDetailStats[f].skipped++;
            else if (collected[f] && collected[f] !== 'skipped') fieldDetailStats[f].filled++;
        }
    }

    // p50 session duration (DASH-03)
    const durations: number[] = [];
    for (const row of sessions) {
        const d = new Date(row.last_activity || row.created_at).getTime() - new Date(row.created_at).getTime();
        if (d > 0 && d < 24 * 60 * 60 * 1000) durations.push(d);
    }
    durations.sort((a, b) => a - b);
    const p50SessionDurationMs = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;

    // Per-field fill rates (% of sessions that collected this field)
    const fieldFillRates: Record<string, number> = {};
    for (const f of ALL_FIELDS) {
        fieldFillRates[f] = total > 0 ? Math.round((fieldCounts[f] / total) * 100) : 0;
    }

    // Lead quality score: avg fields collected out of 7, scaled to 0-100
    const avgFields = total > 0 ? totalFields / total : 0;
    const leadQualityScore = Math.round((avgFields / ALL_FIELDS.length) * 100);

    return {
        leadCompletionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        leadQualityScore,
        effectiveEscalationRate: total > 0 ? Math.round((effectiveLeads / total) * 100) : 0,
        fieldFillRates,
        fieldStats: fieldDetailStats,     // DASH-05
        recoveryRate: recoverable > 0 ? Math.round((recovered / recoverable) * 100) : 0,
        abandonmentRate: total > 0 ? Math.round((abandoned / total) * 100) : 0,
        avgSessionDurationMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0,
        p50SessionDurationMs,             // DASH-03
        totalSessions: total,
        completedSessions: completed,
        abandonedSessions: abandoned,
    };
}

// ─── Token Cost Metrics (DASH-04) ───────────────────────────────────────────
export async function getTokenCostMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('llm_logs')
        .select('prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, conversation_id, created_at')
        .gte('created_at', since)
        .not('total_tokens', 'is', null);

    if (error || !data || data.length === 0) {
        return { avgTokensPerConv: 0, totalTokens: 0, estimatedDailyCost: 0, logsWithTokens: 0, totalPromptTokens: 0, totalCompletionTokens: 0 };
    }

    const totalTokens = data.reduce((s: number, r: any) => s + (r.total_tokens || 0), 0);
    const totalPromptTokens = data.reduce((s: number, r: any) => s + (r.prompt_tokens || 0), 0);
    const totalCompletionTokens = data.reduce((s: number, r: any) => s + (r.completion_tokens || 0), 0);
    const totalCost = data.reduce((s: number, r: any) => s + (r.estimated_cost_usd || 0), 0);
    const uniqueConvs = new Set(data.map((r: any) => r.conversation_id)).size;
    const avgTokensPerConv = uniqueConvs > 0 ? Math.round(totalTokens / uniqueConvs) : 0;
    const dailyCost = days > 0 ? totalCost / days : 0;

    return { avgTokensPerConv, totalTokens, estimatedDailyCost: dailyCost, logsWithTokens: data.length, totalPromptTokens, totalCompletionTokens };
}

// ─── Shadow Mode Metrics (SHADOW-02, SHADOW-03) ──────────────────────────────
export async function getShadowMetrics(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('shadow_logs')
        .select('agreed, current_state, shadow_proposal, created_at')
        .gte('created_at', since);

    if (error || !data || data.length === 0) {
        return { overall: 0, byDay: [] as Array<{ date: string; pct: number; total: number }>, totalLogs: 0, agreedCount: 0, hasData: false };
    }

    const agreedCount = data.filter((r: any) => r.agreed === true).length;
    const overallPct = data.length > 0 ? Math.round((agreedCount / data.length) * 100) : 0;

    // 7-day trend
    const byDayMap: Record<string, { total: number; agreed: number }> = {};
    for (const row of data) {
        const day = (row.created_at as string).substring(0, 10);
        if (!byDayMap[day]) byDayMap[day] = { total: 0, agreed: 0 };
        byDayMap[day].total++;
        if (row.agreed === true) byDayMap[day].agreed++;
    }
    const byDay = Object.entries(byDayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { total, agreed }]) => ({
            date,
            pct: total > 0 ? Math.round((agreed / total) * 100) : 0,
            total,
        }));

    // Readiness: 7 consecutive days all >= 95%
    const last7 = byDay.slice(-7);
    const isReady = last7.length >= 7 && last7.every(d => d.pct >= 95);

    return { overall: overallPct, byDay, totalLogs: data.length, agreedCount, hasData: true, isReady };
}

// ─── System Alerts (reading) ─────────────────────────────────────────────────
export async function getSystemAlerts(hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('system_alerts')
        .select('id, created_at, alert_type, severity, metric_value, threshold, message, resolved')
        .eq('resolved', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error || !data) return [];
    return data;
}

// ─── Alert Threshold Check + Write (ALERT-01 to ALERT-04) ───────────────────
// Called on each dashboard load (from fetchAll in page.tsx) so system_alerts stays current.
// Gemma 3 27B is free — DAILY_TOKEN_BUDGET_USD defaults to 0 so cost alert never fires,
// but the check logic is present for when pricing is added.
const DAILY_TOKEN_BUDGET_USD = Number(process.env.DAILY_TOKEN_BUDGET_USD ?? '0');

export async function checkAndWriteAlerts() {
    const [errorMetrics, tokenMetrics, shadowMetrics] = await Promise.all([
        getErrorMetrics(1),      // last 24h
        getTokenCostMetrics(1),  // last 24h
        getShadowMetrics(7),     // last 7 days
    ]);

    const alertsToInsert: Array<{
        alert_type: string;
        severity: string;
        metric_value: number;
        threshold: number;
        message: string;
    }> = [];

    // ALERT-01: Fallback rate > 5%
    const fallbackRate = errorMetrics.total > 0
        ? (errorMetrics.safetyNetTriggers / errorMetrics.total) * 100 : 0;
    if (fallbackRate > 5) {
        alertsToInsert.push({
            alert_type: 'fallback_rate',
            severity: 'warning',
            metric_value: fallbackRate,
            threshold: 5,
            message: `Fallback rate ${fallbackRate.toFixed(1)}% exceeds 5% threshold (last 24h)`,
        });
    }

    // ALERT-02: LLM error rate > 1%
    const errorRate = errorMetrics.total > 0
        ? (errorMetrics.errorIntents / errorMetrics.total) * 100 : 0;
    if (errorRate > 1) {
        alertsToInsert.push({
            alert_type: 'llm_error_rate',
            severity: 'critical',
            metric_value: errorRate,
            threshold: 1,
            message: `LLM error rate ${errorRate.toFixed(1)}% exceeds 1% threshold (last 24h)`,
        });
    }

    // ALERT-03: Eval regression < 95%
    try {
        const evalResults = await getLatestEvalResults();
        if (evalResults && typeof evalResults.overallScore === 'number' && evalResults.overallScore < 95) {
            alertsToInsert.push({
                alert_type: 'eval_regression',
                severity: 'critical',
                metric_value: evalResults.overallScore,
                threshold: 95,
                message: `Eval score ${evalResults.overallScore}% below 95% threshold`,
            });
        }
    } catch {
        // Eval file read failure is non-fatal
    }

    // ALERT-04a: Cost budget exceeded (CONTEXT.md: "daily token spend exceeds budget")
    // DAILY_TOKEN_BUDGET_USD defaults to 0 — Gemma is free so this never triggers unless
    // the env var is set to a real budget. Logic is present for future pricing scenarios.
    if (DAILY_TOKEN_BUDGET_USD > 0 && tokenMetrics.estimatedDailyCost > DAILY_TOKEN_BUDGET_USD) {
        alertsToInsert.push({
            alert_type: 'cost_anomaly',
            severity: 'warning',
            metric_value: tokenMetrics.estimatedDailyCost,
            threshold: DAILY_TOKEN_BUDGET_USD,
            message: `Daily cost $${tokenMetrics.estimatedDailyCost.toFixed(4)} exceeds budget $${DAILY_TOKEN_BUDGET_USD.toFixed(2)}`,
        });
    }

    // ALERT-04b: Shadow alignment < 95% (only if we have enough data)
    if (shadowMetrics.hasData && shadowMetrics.totalLogs > 10 && shadowMetrics.overall < 95) {
        alertsToInsert.push({
            alert_type: 'shadow_alignment',
            severity: 'warning',
            metric_value: shadowMetrics.overall,
            threshold: 95,
            message: `Shadow alignment ${shadowMetrics.overall}% below 95% (last 7 days)`,
        });
    }

    if (alertsToInsert.length > 0) {
        const { error } = await supabase.from('system_alerts').insert(alertsToInsert);
        if (error) console.error('[Alerts] Insert failed:', error.message);
    }

    return alertsToInsert;
}
