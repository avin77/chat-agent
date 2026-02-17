-- V6 State Machine Migration
-- Adds state tracking columns to conversation_sessions table
-- Run this in Supabase SQL Editor

-- Add state machine columns
ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS current_state TEXT DEFAULT 'START',
  ADD COLUMN IF NOT EXISTS collected_data JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0;

-- Index for quick lookups by state
CREATE INDEX IF NOT EXISTS idx_sessions_current_state ON conversation_sessions(current_state);

-- Update leads table to include all collected fields from state machine
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS schedule TEXT,
  ADD COLUMN IF NOT EXISTS salary_expectation TEXT,
  ADD COLUMN IF NOT EXISTS family_size_text TEXT,
  ADD COLUMN IF NOT EXISTS has_prior_experience TEXT,
  ADD COLUMN IF NOT EXISTS collected_via TEXT DEFAULT 'state_machine';
