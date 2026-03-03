-- V7 Intent Stack & History Migration
-- Adds multi-intent tracking columns to conversation_sessions table
-- Run this in Supabase SQL Editor

-- Add intent stack and history columns
ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS intent_stack JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS intent_history JSONB DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN conversation_sessions.intent_stack IS 'Stack of intents for multi-intent handling (array of {intent, state, slots})';
COMMENT ON COLUMN conversation_sessions.intent_history IS 'History of all intents activated during this session';
