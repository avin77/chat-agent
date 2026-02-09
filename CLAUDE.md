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
- **Streaming**: Uses Vercel AI SDK `streamText()` with `toUIMessageStreamResponse()`
- **Guardrails**: Post-processing strips prices, validates phones, removes external links
- **Escalation**: When `[ESCALATE]` tag detected in AI response, saves to DB and sends email

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
