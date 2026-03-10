# Planning Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconcile `ROADMAP.md` and `STATE.md` so they reflect completed local v3 work and package the remaining PM/technical work clearly.

**Architecture:** Treat `ROADMAP.md` as the milestone source of truth and rewrite `STATE.md` to summarize the current active milestone, completed phases, remaining phases, and pending planning work. Keep the change narrow to planning docs only.

**Tech Stack:** Markdown, GSD planning artifacts

---

### Task 1: Reconcile Roadmap Status

**Files:**
- Modify: `.planning/ROADMAP.md`

**Step 1: Update the v3 phase overview**

Mark V3-01, V3-02, V3-03, and V3-05 as complete based on local summaries/commits. Keep V3-04, V3-06, V3-07, V2-TD-01, and V2-TD-02 as remaining work.

**Step 2: Add a current execution section**

Add a short section that states the local execution queue and clarifies that shadow expansion remains out of scope.

**Step 3: Package remaining work**

Extend V3-04, V3-06, and V3-07 sections with why-now framing, current risks, and recommended next action.

### Task 2: Reconcile State

**Files:**
- Modify: `.planning/STATE.md`

**Step 1: Update state frontmatter**

Change milestone metadata from the stale v2 state to the current v3 milestone.

**Step 2: Rewrite current status summary**

Replace the outdated v2-in-progress summary with a v3 summary showing completed local phases and remaining work.

**Step 3: Keep continuity and todo context**

Preserve the new session continuity and pending todo visibility added during resume/todo capture.

### Task 3: Verify

**Files:**
- Review: `.planning/ROADMAP.md`
- Review: `.planning/STATE.md`

**Step 1: Inspect diffs**

Run `git diff -- .planning/ROADMAP.md .planning/STATE.md docs/plans/2026-03-10-planning-reconciliation-design.md docs/plans/2026-03-10-planning-reconciliation.md`

**Step 2: Confirm narrative consistency**

Make sure roadmap, state, and todo framing all tell the same story.
