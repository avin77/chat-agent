-- V5 Enhanced Prompt System - Database Migration
-- Run this in Supabase SQL Editor

-- 1. LEADS TABLE (All hiring enquiries)
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  -- Contact Info
  name text,
  phone text,
  
  -- Lead Details
  is_replacement boolean,
  previous_maid_from_ezyhelpers boolean,
  maid_type text,
  work_description text,
  duration_months integer,
  work_schedule text,
  family_size integer,
  has_servant_room boolean,
  salary_expectation text,
  preferences text,
  
  -- Metadata
  conversation_id text,
  status text DEFAULT 'new',
  full_conversation jsonb
);

-- 2. COMPLAINTS TABLE
CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  name text,
  phone text,
  issue_description text,
  urgency text,
  maid_name text,
  conversation_id text,
  status text DEFAULT 'open',
  full_conversation jsonb
);

-- 3. HELPER REGISTRATIONS TABLE
CREATE TABLE IF NOT EXISTS helper_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  name text,
  phone text,
  work_type text,
  experience_years integer,
  preferred_schedule text,
  expected_salary text,
  languages_spoken text[],
  conversation_id text,
  status text DEFAULT 'new',
  full_conversation jsonb
);

-- 4. LLM LOGS TABLE
CREATE TABLE IF NOT EXISTS llm_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  conversation_id text,
  intent text,
  system_prompt text,
  user_message text,
  full_message_history jsonb,
  raw_llm_response text,
  after_guardrails text,
  took_ms integer,
  tokens_used integer
);

-- 5. TTL Cleanup Function
CREATE OR REPLACE FUNCTION delete_old_llm_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM llm_logs WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- 6. GENERAL ENQUIRIES TABLE
CREATE TABLE IF NOT EXISTS general_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  conversation_id text,
  question text,
  bot_answer text,
  converted_to_lead boolean DEFAULT false
);

-- 7. CONVERSATION SESSIONS TABLE
CREATE TABLE IF NOT EXISTS conversation_sessions (
  conversation_id text PRIMARY KEY,
  detected_intent text,
  created_at timestamptz DEFAULT now(),
  last_activity timestamptz DEFAULT now(),
  metadata jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_conv_id ON llm_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON conversation_sessions(last_activity DESC);

-- Add unique index to prevent duplicate leads (Functional Index using UTC date)
CREATE UNIQUE INDEX IF NOT EXISTS unique_phone_per_day ON leads (phone, ((created_at AT TIME ZONE 'UTC')::date));
