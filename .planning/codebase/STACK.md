# Technology Stack

**Analysis Date:** 2026-02-27

## Languages

**Primary:**
- TypeScript 5.x - All application code, API routes, and components
- JavaScript (Node.js) - Build scripts and CLI tools

**Secondary:**
- JSX/TSX - React component definitions in `src/components/` and `src/app/`

## Runtime

**Environment:**
- Node.js v24.13.0 (development) / v22+ (production via Vercel)

**Package Manager:**
- npm 10.9.0
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework with App Router
- React 19.2.3 - UI component library
- React DOM 19.2.3 - DOM rendering

**AI/LLM:**
- ai 6.0.41 - Vercel AI SDK (generateText, streaming utilities)
- @ai-sdk/google 3.0.10 - Google Gemini model integration
- @ai-sdk/react 3.0.43 - React hooks for AI (useChat)
- @ai-sdk/ui-utils 1.2.11 - UI utility functions

**Styling:**
- Tailwind CSS 4.0.0 - Utility-first CSS framework
- @tailwindcss/postcss 4.0.0 - Tailwind PostCSS plugin
- PostCSS 8.5.6 - CSS processing
- Autoprefixer 10.4.24 - Vendor prefix generation
- tailwind-merge 3.4.0 - Utility class merging (avoiding conflicts)
- clsx 2.1.1 - Conditional class name builder

**Animation:**
- framer-motion 12.27.1 - React animation library

**UI Icons:**
- lucide-react 0.562.0 - React icon library

**Database/ORM:**
- @supabase/supabase-js 2.90.1 - Supabase PostgreSQL client
- zod 3.24.1 - TypeScript-first schema validation and parsing

**Email:**
- nodemailer 7.0.12 - SMTP email sending (Gmail primary)
- @types/nodemailer 7.0.5 - TypeScript types for nodemailer
- resend 6.8.0 - Email API (fallback provider)

**HTTP:**
- node-fetch 3.3.2 - Fetch API for Node.js

## Key Dependencies

**Critical:**
- ai SDK - Powers all LLM interactions and streaming responses
- @supabase/supabase-js - Database persistence for conversations, leads, complaints, helper registrations, and LLM logs
- nodemailer - Email escalation notifications to admin

**Infrastructure:**
- Tailwind CSS v4 - Post-CSS based build system (NOT v3 `@import` syntax)
- Zod - Runtime schema validation for extracted data (slots, forms)

## Configuration

**Environment:**
- `.env.local` file required (not tracked in git)
- Environment variables configured via `process.env` in server-side code

**Build:**
- `next.config.ts` - Next.js configuration (minimal)
- `tsconfig.json` - TypeScript compiler options
- `eslint.config.mjs` - ESLint flat config with Next.js and TypeScript rules

**Linting:**
- ESLint 9.x with `eslint-config-next` and `eslint-config-next/typescript`

## Platform Requirements

**Development:**
- Node.js 22+ (v24 tested)
- npm 10+
- Windows 11 or WSL2 Ubuntu (project developed on Windows + WSL2)

**Production:**
- Vercel hosting (Next.js optimized)
- PostgreSQL database via Supabase
- Runtime: Node.js 20+ (Vercel default)
- Max duration per request: 30 seconds (`export const maxDuration = 30` in `src/app/api/chat/route.ts`)
- Runtime mode: `nodejs` (required for nodemailer, fs module)

**Deployment:**
- Auto-deploys from GitHub (main branch) to Vercel
- Build command: `npm run build`
- Start command: `next start`

---

*Stack analysis: 2026-02-27*
