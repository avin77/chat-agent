# Codebase Structure

**Analysis Date:** 2026-02-27

## Directory Layout

```
src/
├── app/                           # Next.js App Router pages & API routes
│   ├── api/
│   │   └── chat/
│   │       └── route.ts           # Main chat endpoint: intent detection, state machine, LLM
│   ├── chat/
│   │   └── page.tsx               # Chat page wrapper
│   ├── dashboard/
│   │   ├── page.tsx               # Analytics dashboard (eval metrics, conversation health)
│   │   └── actions.ts             # Server actions for dashboard queries
│   ├── debug/
│   │   ├── page.tsx               # Debug UI for testing
│   │   └── actions.ts             # Debug server actions
│   ├── embed/
│   │   ├── page.tsx               # Embeddable widget version
│   │   └── layout.tsx             # Embed-specific layout (no header)
│   ├── layout.tsx                 # Root layout (Tailwind, globals)
│   └── page.tsx                   # Home page (renders ChatWidget)
├── components/
│   └── chat/
│       ├── ChatWidget.tsx          # Client-side chat UI ('use client'), session management
│       └── SuggestionChips.tsx     # Quick-reply suggestion buttons
├── core/
│   ├── ai/
│   │   └── prompts.ts             # Legacy prompt definitions (see lib/prompts-enhanced.ts)
│   ├── config.ts                  # Constants: assistant name, user roles, intents, question flows
│   ├── db/
│   │   ├── client.ts              # Supabase client initialization
│   │   ├── schema.ts              # TypeScript types for database (generated or manual)
│   │   └── actions.ts             # Database query helpers
│   └── questions.ts               # Question flow definitions (legacy?)
├── extractors/                    # Data extraction & detection utilities
│   ├── dataExtractor.ts           # Phone, name, location, service type extraction
│   ├── intentDetector.ts          # Intent detection from text (used in route.ts)
│   └── llmExtractor.ts            # LLM-based extraction (experimental/fallback)
├── flows/                         # State machine flow implementations
│   ├── BaseFlow.ts                # Abstract base class with core state machine logic
│   ├── MaidHiringFlow.ts          # Concrete: 8-step flow for maid hire (phone → location → service → schedule → salary → family → experience)
│   ├── ComplaintFlow.ts           # Concrete: fast escalation for complaints (not currently used in route.ts)
│   └── HelperRegistrationFlow.ts  # Concrete: helper registration flow (not currently used in route.ts)
├── lib/                           # Utility functions & middleware
│   ├── email.ts                   # Nodemailer SMTP & Resend fallback
│   ├── guardrails.ts              # Post-LLM filtering: price blocking, link removal, phone validation
│   ├── llm-logger.ts              # Log LLM interactions to Supabase
│   ├── prompts-enhanced.ts        # System prompts per intent (complaint, helper_reg, maid_hire, general)
│   ├── rateLimiter.ts             # In-memory Gemini API rate limiter
│   └── utils.ts                   # Generic utility functions (if any)
└── test/                          # Test cases and runners
    ├── testCases.ts               # Golden dataset test cases
    └── testRunner.ts              # Evaluation runner
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router pages, layouts, and API endpoints
- Contains: Page components (.tsx), server actions (.ts), route handlers
- Key files: `src/app/api/chat/route.ts` (main business logic), `src/app/page.tsx` (entry), `src/app/dashboard/page.tsx` (analytics)

**`src/components/chat/`:**
- Purpose: Reusable chat UI components
- Contains: React client components ('use client' boundary)
- Key files: `src/components/chat/ChatWidget.tsx` (main UI, session management), `src/components/chat/SuggestionChips.tsx` (quick replies)

**`src/core/`:**
- Purpose: Core domain models, configuration, and database access
- Contains: Config constants, Supabase client, database schema types
- Key files: `src/core/config.ts` (intents, roles, question flows), `src/core/db/client.ts` (Supabase init)

**`src/extractors/`:**
- Purpose: Extract structured data from unstructured user text
- Contains: Regex-based extractors, validators, fuzzy matching logic
- Key files: `src/extractors/dataExtractor.ts` (main extraction), `src/extractors/intentDetector.ts` (intent detection)

**`src/flows/`:**
- Purpose: Deterministic state machine implementations for different intent types
- Contains: Abstract BaseFlow class, concrete flow implementations (MaidHiringFlow, ComplaintFlow, etc.)
- Key files: `src/flows/BaseFlow.ts` (core logic), `src/flows/MaidHiringFlow.ts` (primary active flow)

**`src/lib/`:**
- Purpose: Utility modules: guardrails, logging, email, rate limiting
- Contains: Post-processing filters, observability, infrastructure integrations
- Key files: `src/lib/guardrails.ts` (safety), `src/lib/email.ts` (escalation), `src/lib/llm-logger.ts` (observability)

**`src/test/`:**
- Purpose: Test cases and evaluation runners
- Contains: Golden dataset definitions, test execution logic
- Key files: `src/test/testCases.ts` (20+ conversation scenarios), `src/test/testRunner.ts` (eval runner)

## Key File Locations

**Entry Points:**

- `src/app/page.tsx`: Home page (renders ChatWidget for embedded usage)
- `src/app/chat/page.tsx`: Standalone chat page
- `src/app/api/chat/route.ts`: Chat API endpoint (POST handler, 775 lines)

**Configuration:**

- `src/core/config.ts`: Constants for intents, user roles, question flows
- `.env.local`: API keys (GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE URLs, GMAIL credentials)

**Core Logic:**

- `src/app/api/chat/route.ts`: Main orchestration (intent detection, session management, state machine or LLM routing)
- `src/flows/BaseFlow.ts`: State machine core (processMessage logic, state transitions)
- `src/flows/MaidHiringFlow.ts`: 8-step maid hire flow definition
- `src/extractors/dataExtractor.ts`: Slot extraction (phone, location, service, etc.)

**Safety & Observability:**

- `src/lib/guardrails.ts`: Post-response filtering (prices, links, phone)
- `src/lib/llm-logger.ts`: Supabase logging of all LLM interactions
- `src/lib/email.ts`: Nodemailer SMTP + Resend fallback

**UI:**

- `src/components/chat/ChatWidget.tsx`: React client component, session ID management, message streaming
- `src/app/dashboard/page.tsx`: Analytics dashboard (eval scores, response quality)

## Naming Conventions

**Files:**

- **Pages:** `page.tsx` in directory named after route (e.g., `src/app/chat/page.tsx`)
- **API routes:** `route.ts` in directory matching API path (e.g., `src/app/api/chat/route.ts`)
- **Server actions:** `actions.ts` colocated with page (e.g., `src/app/dashboard/actions.ts`)
- **Components:** PascalCase (e.g., `ChatWidget.tsx`, `SuggestionChips.tsx`)
- **Utilities:** camelCase (e.g., `guardrails.ts`, `llm-logger.ts`)
- **Flows:** `[Name]Flow.ts` (e.g., `MaidHiringFlow.ts`, `ComplaintFlow.ts`)
- **Extractors:** `[type]Extractor.ts` (e.g., `dataExtractor.ts`, `intentDetector.ts`)

**Directories:**

- **Feature-based:** `src/components/chat/`, `src/flows/`, `src/extractors/`
- **Type-based:** `src/app/api/`, `src/lib/`, `src/core/db/`
- **Page routes:** Match Next.js App Router convention (e.g., `src/app/dashboard/`)

**Functions:**

- **Extractors:** `extract[Field]()` (e.g., `extractPhone()`, `extractLocation()`)
- **Validators:** `validate[Field]()` or `is[Field]()` (e.g., `validatePhone()`, `isValidPhone()`)
- **Detectors:** `detect[Type]()` (e.g., `detectIntent()`, `detectFAQ()`)
- **Processors:** `process[Type]()` (e.g., `processMessage()`)
- **Handlers:** `handle[Type]()` (e.g., `handleMaidHireStateMachine()`)

**Types & Interfaces:**

- **PascalCase:** `FlowState`, `ProcessResult`, `SessionState`, `StepDefinition`, `FailureType`
- **Enums:** ALL_CAPS for values (e.g., `FlowState.ASK_PHONE`)

## Where to Add New Code

**New Feature (e.g., new intent type like "cleaning_service"):**
- Primary code: Create `src/flows/CleaningServiceFlow.ts` extending `BaseFlow`
- Define steps, validators, and completion instruction
- Add intent detection logic to `detectIntent()` in `src/app/api/chat/route.ts` line 76-101
- Add system prompt to `src/lib/prompts-enhanced.ts` if using LLM-only flow
- Add escalation table handling in route.ts if escalation needed
- Tests: Create test cases in `src/test/testCases.ts`

**New Component/Module:**
- UI Component: Place in `src/components/[feature]/` with PascalCase filename
- Utility function: Place in `src/lib/` for cross-cutting concerns, or local file if feature-specific
- Extractor: Add function to `src/extractors/dataExtractor.ts` if slot-related, else create `src/extractors/[domain]Extractor.ts`

**Utilities & Helpers:**
- Shared helpers: `src/lib/utils.ts`
- Flow-specific helpers: Keep in `src/flows/` directory
- Extraction-specific helpers: Keep in `src/extractors/` directory

**API Integration (new external service like Twilio for SMS):**
- Create module: `src/lib/twilio.ts` with initialization and send functions
- Add env vars to `.env.local` (TWILIO_API_KEY, TWILIO_PHONE_NUMBER, etc.)
- Import and call from route handler or server action
- Add error handling and logging similar to email.ts pattern

**Database Query (new table):**
- Add table type to `src/core/db/schema.ts`
- Create helper function in `src/core/db/actions.ts` (e.g., `saveNewTable()`)
- Import and call from route handler
- Log to `src/lib/llm-logger.ts` or create new logger for this domain

## Special Directories

**`src/app/api/`:**
- Purpose: Next.js API route handlers
- Generated: No
- Committed: Yes
- Files: `src/app/api/chat/route.ts` (main POST endpoint)

**`.next/`:**
- Purpose: Build output and type definitions (auto-generated)
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (by npm install)
- Committed: No (in .gitignore)

**`data/`:**
- Purpose: Test datasets, eval results, golden datasets
- Generated: Yes (by eval scripts)
- Committed: Partially (golden dataset committed, eval results not)
- Key files: `data/state-golden-dataset.json` (28 test conversations), `data/eval-state-*.json` (eval results)

**`chat_debug.log`:**
- Purpose: Runtime debug log (session transitions, errors, LLM calls)
- Generated: Yes (by route.ts)
- Committed: No (in .gitignore)

---

*Structure analysis: 2026-02-27*
