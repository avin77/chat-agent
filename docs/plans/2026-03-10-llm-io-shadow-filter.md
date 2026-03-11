# LLM I/O Shadow Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `Mode` filter to `LLM I/O` so PMs can inspect production logs, shadow logs, or both for the same conversation.

**Architecture:** Keep production `llm_logs` and background `shadow_logs` as separate data sources. Extend dashboard server actions with shadow conversation list/detail queries, then update the `LLM I/O` tab to switch between production, shadow, and combined views without changing the existing production logging model.

**Tech Stack:** Next.js App Router, React client state, Supabase server actions, TypeScript.

---

### Task 1: Add server actions for shadow conversations and shadow turn details

**Files:**
- Modify: `src/app/dashboard/actions.ts`

**Step 1: Write the failing test**

Add a lightweight regression script in `src/test` that verifies shadow log rows can be grouped into conversation summaries and detailed turn cards.

**Step 2: Run test to verify it fails**

Run: `node src/test/test-shadow-llm-io.js`

Expected: FAIL because the helper/query shape does not exist yet.

**Step 3: Write minimal implementation**

Add:
- `getConversationShadowLogs(conversationId)`
- `getShadowConversations(limit, days, intent?)`

Use `shadow_logs` as the source of truth and join back to `conversation_sessions` for intent/current state when available.

**Step 4: Run test to verify it passes**

Run: `node src/test/test-shadow-llm-io.js`

Expected: PASS

### Task 2: Add `Mode` filter and shadow list loading to `LLM I/O`

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Write the failing test**

Extend the same regression script with a pure helper expectation for the new filter labels / empty states if extracted, or verify the added mode constants manually through a minimal helper.

**Step 2: Run test to verify it fails**

Run: `node src/test/test-shadow-llm-io.js`

Expected: FAIL until mode support exists.

**Step 3: Write minimal implementation**

Add:
- `llmMode` state: `production | shadow | both`
- mode pills in the `LLM I/O` left panel
- list loading behavior:
  - `production` → current production list
  - `shadow` → shadow conversation list
  - `both` → merged unique conversation ids with counts from both sources

**Step 4: Run test to verify it passes**

Run: `node src/test/test-shadow-llm-io.js`

Expected: PASS

### Task 3: Render shadow detail cards in the right panel

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Write the failing test**

Add expectation that mapped shadow turn data includes:
- user input
- current state
- prod next state
- shadow next state
- proposed slots
- tool calls
- agreed status

**Step 2: Run test to verify it fails**

Run: `node src/test/test-shadow-llm-io.js`

Expected: FAIL until shadow detail mapping/rendering is in place.

**Step 3: Write minimal implementation**

Add a shadow detail renderer for:
- `shadow` mode only
- `both` mode below/alongside production logs

**Step 4: Run test to verify it passes**

Run: `node src/test/test-shadow-llm-io.js`

Expected: PASS

### Task 4: Verify manually in the dashboard

**Files:**
- Modify: none

**Step 1: Restart dev server**

Run: `npm run dev`

**Step 2: Generate fresh data**

Run one maid-hire conversation with `USE_AGENTIC=false`.

**Step 3: Verify UI**

Check `LLM I/O`:
- `Production` shows current `llm_logs`
- `Shadow` shows `shadow_logs`
- `Both` shows both for the selected conversation

**Step 4: Commit**

```bash
git add src/app/dashboard/actions.ts src/app/dashboard/page.tsx src/test/test-shadow-llm-io.js docs/plans/2026-03-10-llm-io-shadow-filter.md
git commit -m "feat: add shadow mode inspection to dashboard llm io"
```
