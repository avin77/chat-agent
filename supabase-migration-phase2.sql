-- supabase-migration-phase2.sql
-- Phase 2: Agentic Tool-Calling Flow
-- Adds agentic_mode tracking to conversation_sessions
-- Safe to re-run (ADD COLUMN IF NOT EXISTS)

-- Add agentic_mode flag to track which sessions used the agentic handler
ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS agentic_mode BOOLEAN DEFAULT false;

-- Index for dashboard queries (agentic vs deterministic comparison)
CREATE INDEX IF NOT EXISTS idx_sessions_agentic_mode
  ON conversation_sessions(agentic_mode, created_at DESC);
