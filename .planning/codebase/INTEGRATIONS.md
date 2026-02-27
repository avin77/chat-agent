# External Integrations

**Analysis Date:** 2026-02-27

## APIs & External Services

**LLM (Generative AI):**
- Google Gemini (`gemma-3-27b-it`)
  - SDK: `@ai-sdk/google` + `ai`
  - Auth: `GOOGLE_GENERATIVE_AI_API_KEY`
  - Used in: `src/app/api/chat/route.ts` (generateText for response generation)
  - Rate limiting: 30 requests/minute (free tier) via `src/lib/rateLimiter.ts` (GeminiRateLimiter class)

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - Client: `@supabase/supabase-js` v2.90.1
  - Location: `src/core/db/client.ts` (createClient initialization)
  - Service role key stored in `.env.local` (for server-side operations)

**Supabase Tables:**
- `conversation_sessions` - Tracks chat sessions, intent detection, last activity
- `llm_logs` - All LLM interactions (system prompt, user message, raw response, cleaned response, latency)
- `complaints` - Escalated complaints from users
- `leads` - Maid hiring leads with collected slots (phone, location, service type, schedule, salary, family size, experience)
- `helper_registrations` - Helper/worker registration inquiries
- `general_enquiries` - General Q&A logs

**File Storage:**
- Local filesystem only (no S3 or cloud storage)
- Used in: `src/app/api/chat/route.ts` (fs module for reading state machine flow files)

**Caching:**
- None (in-memory rate limiter only via `geminiRateLimiter` singleton in `src/lib/rateLimiter.ts`)

## Authentication & Identity

**Auth Provider:**
- Custom (no third-party auth service)
- Supabase service role key used for server-side database access
- No user authentication system (stateless chat sessions)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Rollbar, or similar)

**Logs:**
- Console logging (`console.log`, `console.error`) in `src/lib/llm-logger.ts` and `src/app/api/chat/route.ts`
- Supabase `llm_logs` table captures all LLM interactions including latency and response quality
- Dashboard at `src/app/dashboard/page.tsx` displays conversation metrics and response latency (p50, p95, average)

## CI/CD & Deployment

**Hosting:**
- Vercel (serverless Next.js deployment)
- Live URL: `https://chat-agent-three.vercel.app`
- Auto-deploys on git push to `main` branch

**CI Pipeline:**
- None (Vercel auto-deploys without explicit CI/CD)
- Pre-deployment: ESLint lint check (`npm run lint`)

## Environment Configuration

**Required env vars:**
- `GOOGLE_GENERATIVE_AI_API_KEY` - Gemini API key (server-side, in `.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public, safe for client)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key (server-side, in `.env.local`)
- `GMAIL_USER` - Gmail SMTP username (server-side, in `.env.local`)
- `GMAIL_PASS` - Gmail app password (server-side, in `.env.local`)
- `ADMIN_EMAIL` - Comma-separated admin emails for escalation (server-side, in `.env.local`)
- `RESEND_API_KEY` - Resend email API key, fallback provider (server-side, optional, in `.env.local`)
- `DEMO_MODE` - Set to "true" to skip external calls (optional, in `.env.local`)

**Secrets location:**
- `.env.local` file (not tracked in git, listed in `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- Email notifications sent to `ADMIN_EMAIL` when escalations occur (via nodemailer or Resend)
  - Triggered by: Complaints with phone number, maid hire leads with complete data, helper registrations
  - Endpoint: SMTP (Gmail) or Resend REST API

## Email Delivery

**Primary Provider:**
- Gmail SMTP via nodemailer
  - Configured in `src/lib/email.ts`
  - Uses `GMAIL_USER` and `GMAIL_PASS` (app password, not regular password)
  - Sends from: `"EzyBot Support" <GMAIL_USER>`

**Fallback Provider:**
- Resend Email API
  - Configured in `src/lib/email.ts`
  - Only used if Gmail credentials missing or SMTP fails
  - Auth: `RESEND_API_KEY`

**Email Types:**
- Escalation notifications (complaints, leads, registrations)
- Subject/body templates defined in `src/app/api/chat/route.ts` (htmlContent for each intent)

## Rate Limiting

**Gemini API:**
- Rate limiter: `GeminiRateLimiter` class in `src/lib/rateLimiter.ts`
- Limit: 30 requests per minute (free tier)
- Strategy: Track timestamps in sliding window, reject requests exceeding limit with waitMs calculation
- Status endpoint: `/api/chat` returns rate limit status in error responses

## Data Extraction & Validation

**Validation:**
- Zod schemas used for type-safe parsing in `src/extractors/dataExtractor.ts`
- Phone validation: 10-digit Indian mobile number (6-9 starting digit)
- Location validation: Bengaluru area detection
- Salary acknowledgment: Converts amounts to formatted rupee strings (₹15,000 per month)

**Extractors:**
- `src/extractors/dataExtractor.ts` - Deterministic slot extraction, FAQ detection, gibberish detection, city validation
- `src/extractors/llmExtractor.ts` - Gemini-powered structured data extraction using `generateObject` (Zod schemas)

---

*Integration audit: 2026-02-27*
