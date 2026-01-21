# EzyBot Planning Documents

This directory contains the evolution of EzyBot's architecture and implementation plans.

## 📚 Version History

### V5: Enhanced Prompt System (CURRENT - Production)
**File**: `v5_enhanced_prompts_CURRENT.md`  
**Date**: January 2026  
**Status**: ✅ **Implementation Ready**

**Key Features**:
- Supabase integration (separate tables for leads/complaints)
- Strict guardrails (price blocking, phone validation)
- Conversation state management (intent detected once)
- LLM I/O logging + debug dashboard
- Context window management (token limit protection)
- TTL policies for log cleanup

**Tech Stack**: Next.js + AI SDK + Gemma 3-1B-IT + Supabase + Nodemailer

**Decision**: Chosen over V4 due to simplicity and realistic expectations for 1B model capabilities.

---

### V4: File-Based Flow System (DEPRECATED)
**File**: `v4_file_based_flows.md`  
**Date**: January 2026  
**Status**: ⚠️ **Not Implemented** (too complex for MVP)

**Concept**:
- TypeScript flow templates with conditional logic
- Flow manager for routing
- State machine architecture

**Why Deprecated**:
- Over-engineered for `gemma-3-1b-it` capabilities
- Complex testing requirements
- Harder to debug than prompt-based approach

**Lesson Learned**: Keep it simple for MVP. Add complexity only when data proves it's needed.

---

### V2: Agentic & Concise Bot
**File**: `v2_agentic_plan.md`  
**Date**: January 2026  
**Status**: ✅ **Implemented** (foundation for V5)

**Goals**:
- Reduce chattiness (compound questions)
- Immediate escalation (no permission asking)
- Context awareness (skip redundant questions)

**Achievements**:
- Migrated from Gemini to Gemma
- Implemented `[ESCALATE]` tag system
- Gmail SMTP integration

---

## 📊 Task Tracking

**File**: `task_tracker.md`

Running checklist of completed and pending tasks. Updated throughout development.

---

## 🗂️ Document Organization

```
docs/planning/
├── README.md (this file)
├── v2_agentic_plan.md (Foundation)
├── v4_file_based_flows.md (Rejected approach)
├── v5_enhanced_prompts_CURRENT.md (Production plan)
└── task_tracker.md (Progress tracking)
```

---

## 🎯 Next Steps

1. Implement V5 (Enhanced Prompt System)
2. Run Supabase migrations
3. Test with `simulate-enhanced.ts`
4. Deploy to Vercel
5. Collect real user feedback
6. Decide: Keep V5 or revisit V4 if model is upgraded

---

## 💡 Key Learnings

1. **Start Simple**: Don't build infrastructure the LLM can't utilize
2. **Guardrails > Prompt Engineering**: Post-processing is more reliable than hoping LLM follows rules
3. **Logging is Critical**: Can't improve what you can't measure
4. **Session Management**: Intent should be detected once, not every message
5. **Free Tier Constraints**: Design with free tier limits in mind (TTL policies, etc.)
