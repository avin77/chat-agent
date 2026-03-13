-- Migration: v8 Reasoning Persistence
-- Description: Adds thought_reflection and confidence_score to llm_logs

ALTER TABLE llm_logs 
ADD COLUMN thought_reflection TEXT,
ADD COLUMN confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100);
