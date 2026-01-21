
# Implementation Plan - EzyBot V2 (Agentic & Concise)

## Goal Description
Refactor EzyBot logic to be "Agentic" and "Concise". Eliminate excessive back-and-forth. Capture leads instantly. Reduce "chattiness".

## User Review Required
> [!TIP]
> **Compound Questions**: We will ask for Name + Phone in a single message to speed up the flow.
> **Immediate Action**: The bot will trigger the email tool *silently* and then confirm "Escalation Done" instead of asking for permission.

## Proposed Changes

### 1. System Prompt Optimization (`prompts.ts`)
- **Tone**: Change from "Warm/Empathetic" (which causes verbosity) to "Professional, Direct, & Action-Oriented".
- **Instruction**: "Be extremely concise. Do not use filler words."

### 2. Conversation Flow Redesign
#### Complaint Flow
- **Current**: Ask Name -> Ask Phone -> Tool -> Ask Issue.
- **New**: 
    1. User: "I have a complaint."
    2. Bot: "Please share your **Name and Phone Number** so I can escalate this immediately."
    3. User: "John 9876543210"
    4. **Action**: `send_email` (Subject: Lead).
    5. Bot: "Escalated. A support agent will call you within 1 hour. Is there anything else?" (End flow).

#### Maid Request Flow (`questions.ts`)
- **Logic**: Group questions.
    - Message 1: "What service (Cooking/Cleaning) and for how many hours?"
    - Message 2: "Budget and Location?"
    - Message 3: "Name and Phone to connect you?"

### 3. "Agentic" Behavior
- The bot will assume consent to escalate once data is provided.
- It will clearly state "I have done X" rather than "I will do X".

## Verification Plan
1.  **Manual Test**: Check if the bot asks compound questions.
2.  **Turn Count**: Verify a complaint flow takes < 3 turns (currently ~5-6).
