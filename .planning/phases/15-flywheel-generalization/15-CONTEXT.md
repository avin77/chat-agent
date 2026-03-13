# Phase 15 Context: Flywheel Generalization & Level 3 Agentic Upgrade

## Domain and Scope
This phase has a dual focus:
1. **Flywheel Generalization**: Refactoring mining scripts to support all canonical intents dynamically via `AGENTIC_PLAYBOOKS`.
2. **Level 3 Agentic Upgrade**: Replacing the deterministic `nextMissingField()` logic with an autonomous `AgentPlanner` that utilizes Reflection, Tool Decisions, and Confidence Scoring.

## Locked Implementation Decisions

### 1. Level 3 Agentic Runtime (Reasoning & Planning)
- **Guardrailed Reflection**: The agent will use a "Judge" persona within the prompt to audit its own plan. It follows a **3-strike retry policy**: it can attempt to self-correct its plan 3 times; if it remains logically flawed, it must fall back to the Deterministic Safety Net.
- **Self-Correction Triggers**:
    - **Empathy Shift**: Moving to empathy mode if a complaint is detected.
    - **Duplicate Avoidance**: Preventing re-asking for already provided data.
    - **History Audit**: Checking the chat history if a user claims they already answered a question (e.g., "I already gave my phone number").
- **Tool Autonomy**:
    - **Knowledge Source**: Tools and slots are derived strictly from `AGENTIC_PLAYBOOKS`.
    - **Force Redirect**: If the agent attempts to `complete_flow` without a phone number, the safety net silently forces a redirect to "Ask for phone."
    - **Pivoting**: The agent is permitted to swap intents (e.g., Hire -> Complaint) if the user context changes mid-flow.
- **Low Confidence Escalation**:
    - **Signal**: Every decision must include a numerical `confidence` score (0-100).
    - **Threshold**: Auto-escalate if `confidence < 70%` OR after the 3rd failed self-correction loop.
    - **Grace Turn**: Allow exactly one "Clarification" turn with the user before handing off to a human.
    - **Handoff Tone**: Use professional masking: *"I'm connecting you to a specialist for these details."*

### 2. Output & CLI Experience (Mining Scripts)
- **Organization**: Output saved to `data/mined/{intent}/golden-YYYY-MM-DD.json`.
- **Default Behavior**: `npm run mine` defaults to **Mine All** intents.
- **PII Strategy**: Universal regex-based scrubbing across all extracted fields and messages.
- **Empty States**: Warn and skip writing files if no data is found for an intent.

### 3. Metadata & Visibility
- **Persistence**: Store the internal "Reflection/Thought" string permanently in `llm_logs`.
- **Dashboard Visibility**: The "Agentic Quality" tab must display the **Full Chain of Thought** for every turn to allow PMs to audit the agent's reasoning.
- **UX**: Show a "Processing..." status indicator to the user while the agent is reflecting/planning.
- **Planning Context**: Use the **last 3-5 turns** of history for the planning step to balance accuracy and latency.

## Out of Scope
- Building new tools outside of the `AGENTIC_PLAYBOOKS` registry.
- Full E2E UI for the Dashboard's Guardrail Analysis (JSON output only for now).
