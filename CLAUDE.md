# EzyBot Chat Agent

AI-powered customer support chatbot for EzyHelpers.com. Built with Next.js 16, Gemini AI (via Vercel AI SDK), Supabase, and Tailwind CSS v3.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| AI | Google Gemini (`gemma-3-27b-it`) via `@ai-sdk/google` + `ai` SDK |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v3 + PostCSS + Autoprefixer |
| Email | Nodemailer (Gmail SMTP) with Resend fallback |
| Language | TypeScript |

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | Main chat API endpoint - handles streaming, intent detection, session management, escalation |
| `src/components/chat/ChatWidget.tsx` | Client-side chat UI component (`'use client'`) |
| `src/lib/prompts-enhanced.ts` | System prompts per intent (complaint, maid_hire, helper_reg, general) |
| `src/lib/guardrails.ts` | Post-LLM response filtering (price blocking, phone validation, link removal) |
| `src/lib/email.ts` | Email sending via Gmail SMTP / mock fallback |
| `src/lib/rateLimiter.ts` | Gemini API rate limiter |
| `src/lib/llm-logger.ts` | LLM interaction logging to Supabase |
| `src/core/config.ts` | Constants: assistant name, user roles, intents, question flows |
| `.env.local` | API keys and credentials (NEVER commit) |

## Architecture

```
User (ChatWidget) --> POST /api/chat --> Gemini AI (streaming)
                                     --> Intent detection (per session)
                                     --> Supabase logging
                                     --> [ESCALATE] --> Email + DB insert
```

- **Intent detection**: First message determines intent (complaint/maid_hire/helper_reg/general), stored in Supabase `conversation_sessions`
- **Response**: Uses `generateText()` (not streaming) so safety net fallbacks actually reach the user
- **Guardrails**: Post-processing strips prices, validates phones, removes external links
- **Escalation**: Deterministic (phone + action intent) OR LLM `[ESCALATE]` tag → saves to DB and sends email
- **Dead code**: `src/flows/` and `src/extractors/` contain a state machine architecture not yet integrated

## Development

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint
```

## Important Notes

- Tailwind CSS v3 syntax: use `@tailwind base/components/utilities` in CSS (NOT `@import "tailwindcss"` which is v4)
- The `runtime = 'nodejs'` is set in the chat route - nodemailer and fs require Node.js runtime
- Server-only code (fs, nodemailer) must stay in API routes/server components only
- Rate limiting: Gemini API has per-minute limits, handled by `rateLimiter.ts`
- The `[ESCALATE]` tag is stripped from UI display but triggers backend actions

## Supabase Tables

- `conversation_sessions` - tracks intent per conversation
- `complaints` - escalated complaints
- `leads` - maid hire leads
- `helper_registrations` - helper registrations
- `general_enquiries` - general Q&A logs
- `llm_logs` - all LLM interactions

## Environment Variables

Required in `.env.local`:
- `GOOGLE_GENERATIVE_AI_API_KEY` - Gemini API key
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `GMAIL_USER` / `GMAIL_PASS` - Gmail SMTP credentials (app password)
- `ADMIN_EMAIL` - Comma-separated admin emails for escalation
- `RESEND_API_KEY` - Resend email API key (fallback)
- `DEMO_MODE` - Set to "true" to skip external calls

## How Andy Can Deploy & Test EzyBot

When asked to deploy or test changes, Andy should:

```bash
# From inside the container (projects are mounted at /workspace/extra/projects)
cd /workspace/extra/projects/chat-agent
bash deploy.sh "feat: describe what changed"
```

This will:
1. Build the project (`npm run build`)
2. Commit + push to GitHub (`git push origin main`)
3. Vercel auto-deploys from GitHub (takes ~1-2 min)

**Live URL:** Check Vercel dashboard or the URL printed by the script.

**Prerequisite (one-time setup by user):**
- Connect `avin77/chat-agent` GitHub repo to Vercel at vercel.com
- Vercel will auto-deploy on every push to `main`

**For local dev testing only (no public URL):**
```bash
cd /workspace/extra/projects/chat-agent
npm run dev   # runs on localhost:3000 inside container - not publicly accessible
```

## How to Start Andy (WhatsApp AI Assistant)

Run this from PowerShell on Windows — starts Docker, nanoclaw and verifies WhatsApp:
```powershell
cd C:\Coding\EzyBot\ezybot
.\start-andy.ps1
```
Or from anywhere:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Coding\EzyBot\ezybot\start-andy.ps1"
```

**After running:**
- Open WhatsApp → message **yourself** (Saved Messages / self-chat on 918860753300)
- No trigger word needed — just type anything
- Andy stays running 24/7 via `Restart=always` in systemd — auto-recovers from crashes

**Why Andy goes silent (most common cause):**
Windows laptop sleep freezes WSL2, which freezes nanoclaw. Messages sent while laptop is asleep are only seen when it wakes up.
The startup script automatically disables sleep (`powercfg`). If you skipped the script, run manually:
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
```
Or: **Settings → System → Power & Sleep → Sleep → Never**

**To check if Andy is running:**
```powershell
wsl systemctl --user status nanoclaw.service
```

**To see live logs:**
```powershell
wsl journalctl --user -u nanoclaw.service -f
```

## Developer Environment: Windows + WSL2

This project is developed on a **Windows machine with WSL2 (Ubuntu)**. Both sides have the code:

| Side | Path |
|------|------|
| WSL2 Ubuntu | `/home/shobhit/projects/chat-agent/` |
| Windows | `C:\Users\shobh\nanoclaw\` (synced via WSL2) |

**Runtime stack:**
- Node.js v22 (WSL Ubuntu) / v24 (Windows) — both available
- Docker Desktop on Windows (WSL2 integration enabled)
- Git remote: `git@github.com:avin77/chat-agent.git`

**To run from WSL Ubuntu (recommended):**
```bash
cd /home/shobhit/projects/chat-agent
npm run dev
```

**To run from Windows PowerShell:**
```powershell
cd C:\Users\shobh\projects\chat-agent
npm run dev
```

## Related: NanoClaw (WhatsApp → Claude Bridge)

On this machine, **NanoClaw** is also running — it connects WhatsApp to Claude agents via Docker containers. It is a separate project at `/home/shobhit/nanoclaw/` (open source: `gavrielc/nanoclaw`).

NanoClaw is used to interact with Claude via WhatsApp to work on this and other projects. It runs as a systemd user service in WSL Ubuntu:
```bash
systemctl --user status nanoclaw.service   # Check status
systemctl --user restart nanoclaw.service  # Restart if not responding
journalctl --user -u nanoclaw.service -f   # Live logs
```

## Roadmap (see PLAN.md)

- [x] Fix safety net (generateText instead of streamText)
- [x] Improve prompts with few-shot examples
- [x] Deterministic escalation (phone + action intent)
- [x] Guardrails bug fixes
- [ ] Integrate dead code state machine (`src/flows/` + `src/extractors/`)
- [ ] Multi-question flow for maid hiring (8 fields)
- [ ] Add vitest test framework
- [ ] Operations dashboard
- [ ] Semi-agentic upgrade (weighted intent scoring, field tracking)
