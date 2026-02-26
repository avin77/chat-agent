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
