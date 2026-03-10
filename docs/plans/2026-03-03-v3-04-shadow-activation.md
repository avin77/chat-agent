# Phase V3-04: Agentic Shadow Activation

**Goal:** Activate the asynchronous shadow system to measure how well an experimental agentic model aligns with the production state machine.

## Architecture
- **Shadow Handler:** `src/lib/shadowHandler.ts`
- **Database Table:** `shadow_logs`
- **Execution:** Every production turn triggers an unawaited promise to run the same input through the "Agentic" prompt logic.

## Tasks
1. **Verify Shadow Schema:** Ensure `shadow_logs` has all required columns (agreed, shadow_proposal, state_machine_proposal).
2. **Wire into Route:** Call `logShadowResult` from `src/app/api/chat/route.ts` after the production response is sent.
3. **Alignment Logic:** Implement the comparison logic to set the `agreed` flag.
4. **Dashboard Integration:** Ensure the "Shadow Alignment" metric on the dashboard is pulling live data.
