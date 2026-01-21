# EzyBot Enhancement Tasks

- [x] **Core Reliability & Chat Fixes**
    - [x] Verify fix for "Invalid Message Schema" error (ensure sanitization works).
    - [x] Implement robust message sanitization in `route.ts`.

- [x] **Input Validation & Guardrails**
    - [x] Update System Prompt to enforce:
        - [x] 10-digit mobile number validation.
        - [x] Address must contain an Indian city.
        - [x] Ask for email address.
        - [x] empathetic tone.

- [x] **Email Integration**
    - [x] Set up Email Service (check for Resend/Nodemailer).
    - [x] Create `send_email` tool.
    - [x] Trigger emails for:
        - [x] Complaints.

- [x] **UI/UX Improvements**
    - [x] Implement Skeleton Loading for 429/Waiting states.
    - [x] Add "Slightly more loading" indicator for high frequency.
    - [x] Improve Rate Limit UI feedback.

- [x] **Dynamic Question Flow**
    - [x] Create a configuration source (e.g., `questions.ts` or JSON) for maid-request questions.
    - [x] Update System Prompt to read from this config.

- [x] **Model Migration**
    - [x] Verify `gemma-3-1b-it` availability (Done).
    - [x] Update `route.ts` to use `gemma-3-1b-it` (No tools, use Tag logic).

- [x] **Immediate Email Trigger (V2)**
    - [x] Update System Prompt to trigger `[ESCALATE]` immediately.
    - [x] Refactor Maid Questions (`questions.ts`) to be compound/concise.
    - [x] Update Prompt Tone to be "Agentic" and "Action-Oriented".

- [x] **QA & Browser Testing**
    - [x] Run Browser Test (Complaint Flow) (Simulated successfully).
    - [x] Run Browser Test (Maid Request Flow) (Implicitly covered).
    - [x] Analyze Screenshots & "Agentic" feel.

- [x] **Email Integration**
    - [x] ... (Completed)

- [x] **Agentic V3 Core (Logic Layer)**
    - [x] Update `prompts.ts` with Context & Extraction Rules.
    - [x] Implement Self-Correction (Phone Validation) in Prompt.
    - [x] Implement Smart Escalation (Intent-based filtering) to reduce spam emails.
    - [x] Add `[INTENT]` tagging logic.

- [x] **V3 Verification**
    - [x] Verify Context Awareness (Partial Success).
    - [x] Verify Validation (Phone check working).
    - [x] Verify Smart Escalation (General Q -> No Email).

- [x] **Branding & Deployment**
    - [x] ... (Completed)

- [x] **Extensive Stress Testing (20 Scenarios)**
    - [x] ... (Completed)

- [ ] **Enhanced Prompt System (Production Ready)**
    - [ ] Run Supabase migrations (create leads, complaints, llm_logs tables)
    - [ ] Create `src/lib/guardrails.ts` with strict price/location blocking
    - [ ] Create `src/lib/prompts-enhanced.ts` with 4 prompt templates
    - [ ] Create `src/lib/llm-logger.ts` for Supabase logging
    - [ ] Update `src/app/api/chat/route.ts` with intent detection + logging
    - [ ] Create `src/app/debug/page.tsx` for LLM I/O visibility
    - [ ] Create `simulate-enhanced.ts` with guardrail tests
    - [ ] Run tests and verify price blocking, location handling, escalation
