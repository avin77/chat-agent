-- Phase 3: Dashboard & Cost Tracking Migration
-- Run once in Supabase SQL Editor
-- Safe to re-run (all changes use IF NOT EXISTS)
-- Date: 2026-02

-- =============================================================================
-- 1. Token columns on llm_logs (nullable — existing callers unaffected)
--    Old rows remain NULL for these columns, distinguishing pre-Phase3 logs.
-- =============================================================================
ALTER TABLE llm_logs
  ADD COLUMN IF NOT EXISTS prompt_tokens INT,
  ADD COLUMN IF NOT EXISTS completion_tokens INT,
  ADD COLUMN IF NOT EXISTS total_tokens INT,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd FLOAT8;

-- Index for cost aggregation queries
CREATE INDEX IF NOT EXISTS idx_llm_logs_created ON llm_logs(created_at DESC);

-- =============================================================================
-- 2. Shadow logs table (new)
--    Records prod vs shadow state-machine proposals for alignment tracking.
-- =============================================================================
CREATE TABLE IF NOT EXISTS shadow_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text NOT NULL,
  turn_number     int,
  current_state   text,
  user_message    text,
  prod_next_state text,
  prod_slots      jsonb,
  shadow_proposal jsonb,
  agreed          boolean,
  shadow_latency_ms int,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_logs_conv ON shadow_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_shadow_logs_created ON shadow_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_logs_agreed ON shadow_logs(agreed, created_at DESC);

-- =============================================================================
-- 3. System alerts table (new)
--    Stores triggered alerts for fallback rate, LLM error rate, eval regression,
--    cost anomalies, and shadow alignment drift.
-- =============================================================================
CREATE TABLE IF NOT EXISTS system_alerts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now(),
  alert_type   text NOT NULL,
  severity     text NOT NULL,
  metric_value float8,
  threshold    float8,
  message      text,
  resolved     boolean DEFAULT false,
  resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON system_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON system_alerts(resolved, created_at DESC);
