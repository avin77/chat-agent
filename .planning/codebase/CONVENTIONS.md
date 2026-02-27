# Coding Conventions

**Analysis Date:** 2026-02-27

## Naming Patterns

**Files:**
- TypeScript source: `camelCase.ts` (e.g., `dataExtractor.ts`, `chatWidget.tsx`)
- React components: `PascalCase.tsx` (e.g., `ChatWidget.tsx`)
- Directories: `camelCase` (e.g., `src/flows`, `src/extractors`, `src/lib`)
- Configuration files: `kebab-case.mjs` or mixed (e.g., `eslint.config.mjs`, `next.config.ts`)
- Test files: Standalone `test-*.ts` or `test-*.js` in project root (e.g., `test-guardrails.ts`, `test-multi-turn.ts`)

**Functions:**
- `camelCase` for all function names: `detectIntent()`, `validatePhone()`, `extractAllSlots()`, `applyStrictGuardrails()`
- Prefix with verb: `extract*`, `detect*`, `validate*`, `send*`, `log*`
- Async functions use same naming: `async function getOrCreateSession()`, `async function sendEmail()`
- Handler functions: `handle*()` pattern not observed; use descriptive names instead

**Variables:**
- `camelCase` for all variables and constants: `conversationId`, `SESSION_TTL_MS`, `emailPayload`
- All-caps with underscores for constants: `SESSION_TTL_MS = 4 * 60 * 60 * 1000`, `BENGALURU_AREAS = [...]`
- Boolean variables often have no prefix: `isValid`, `isStale`, `isSalaryAck`, `isStuck` (standard `is*/has*/can*` pattern)
- Temporary/internal variables use underscores: `_matcher` (seldom used)

**Types:**
- PascalCase for all interfaces and types: `CollectedData`, `SessionState`, `StepDefinition`, `ProcessResult`, `ExtractedSlots`
- Enum names: PascalCase with UPPERCASE members: `enum FlowState { START, ASK_PHONE, COMPLETE }`
- Type aliases: PascalCase: `type Intent = 'hire_maid' | 'helper_registration' | 'complaint'`
- Generic parameters: Single uppercase letter convention (`T`, `K`, `V`)

## Code Style

**Formatting:**
- No explicit formatter config file (`.prettierrc` or similar not found)
- Import of `clsx` and `tailwind-merge` suggest className handling preference
- Consistent spacing: 4 spaces for indentation (visible in route.ts, guardrails.ts)
- Line wrapping: Functions and imports break before 100-120 chars

**Linting:**
- ESLint v9 with Next.js config: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Config: `eslint.config.mjs` (flat config format, not legacy `.eslintrc.js`)
- Enforces Next.js best practices (web vitals, image optimization, etc.)
- TypeScript strict mode enabled in `tsconfig.json` (`"strict": true`)

**Key ESLint Rules Applied:**
- Next.js core web vitals (accessibility, performance)
- TypeScript strict type checking
- Node.js and Next.js best practices

**Run linting:**
```bash
npm run lint    # Run ESLint check
```

## Import Organization

**Order (observed pattern in source files):**
1. External packages (`import { ... } from 'package-name'`)
2. AI SDK imports (`import { ... } from '@ai-sdk/...'` or `import { ... } from 'ai'`)
3. Internal absolute imports (from `@/` alias)
4. Comments separating logical groups (e.g., `// State machine imports`)

**Example from `src/app/api/chat/route.ts`:**
```typescript
import { google } from '@ai-sdk/google';
import { generateText, createUIMessageStreamResponse } from 'ai';
import * as fs from 'fs';
import { ENHANCED_PROMPTS } from '@/lib/prompts-enhanced';
import { applyStrictGuardrails, validatePhone, extractName } from '@/lib/guardrails';
import { logLLMInteraction, logToConsole } from '@/lib/llm-logger';
import { sendEmail } from '@/lib/email';
import { geminiRateLimiter } from '@/lib/rateLimiter';
import { createClient } from '@supabase/supabase-js';

// State machine imports
import { FlowState, FailureType, SessionState, createSessionState } from '@/flows/BaseFlow';
import { MaidHiringFlow } from '@/flows/MaidHiringFlow';
```

**Path Aliases:**
- `@/*` → `./src/*` (configured in `tsconfig.json`)
- Used throughout codebase: `@/lib`, `@/flows`, `@/extractors`, `@/components`, `@/core`
- Improves readability and refactoring robustness

## Error Handling

**Patterns:**
- **Try-catch for async operations** with silent/logged failures (preferred approach):
  ```typescript
  // From src/lib/llm-logger.ts
  try {
    await supabase.from('llm_logs').insert({...});
    console.log('✅ LLM interaction logged to Supabase');
  } catch (error) {
    console.error('❌ Failed to log LLM interaction:', error);
  }
  ```

- **Database error handling** with code checking:
  ```typescript
  // From src/app/api/chat/route.ts
  const { data: existingSession, error } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .single();

  if (error && error.code !== 'PGRST116') {  // PGRST116 = "no rows found"
    try { fs.appendFileSync('chat_debug.log', `[DB Select Error] ${JSON.stringify(error)}\n`); } catch (e) { }
  }
  ```

- **Graceful fallbacks** (no throwing on recoverable errors):
  ```typescript
  // From src/lib/email.ts
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    try {
      // Send via Gmail
      return { success: true, id: info.messageId };
    } catch (error) {
      console.error('📧 [GMAIL] Failed:', error);
      return { success: false, error };
    }
  }
  // Fallback to mock mode
  console.log('📧 [MOCK EMAIL] To:', recipients.join(', '));
  return { success: true, id: 'mock-id' };
  ```

- **Null/undefined coalescing** for optional values:
  ```typescript
  const isStale = existingSession.detected_intent === 'maid_hire' &&
    (existingSession.attempts ?? 0) >= 3;
  ```

- **Return error objects instead of throwing** in library functions (preferred for UI routes):
  - Function returns `{ success: boolean, error?: Error }`
  - Caller decides to throw, log, or fallback

## Logging

**Framework:** `console` (no dedicated logging library)

**Patterns:**
- **Emoji prefixes for visual scanning:**
  - `✅` = Success
  - `❌` = Error
  - `📧` = Email
  - `🧠` = LLM
  - `🤖` = Bot
  - `📍` = Intent/location
  - `💬` = User message
  - `📥/📤` = Input/output
  - `⏳` = Rate limit/wait

- **Log to console always, optionally to file** (API route writes to `chat_debug.log`):
  ```typescript
  console.log('✅ LLM interaction logged to Supabase');
  console.error('[GUARDRAIL] Price blocked:', cleaned.match(pattern));
  console.warn('[GUARDRAIL] Phone detected:', matches);
  ```

- **Structured logs with context:**
  ```typescript
  console.log(`[Session] Resetting ${reason} session for ${conversationId}`);
  console.log(`[DB Select Error] ${JSON.stringify(error)}`);
  ```

- **Debug log function for detailed output:**
  ```typescript
  // From src/lib/llm-logger.ts
  export function logToConsole(data: {
    intent: string;
    systemPrompt: string;
    userMessage: string;
    rawResponse: string;
    cleanedResponse: string;
  }) {
    console.log('\n' + '='.repeat(80));
    console.log('🧠 LLM INTERACTION LOG');
    console.log('='.repeat(80));
    console.log('📍 Intent:', data.intent);
    // ...
  }
  ```

## Comments

**When to Comment:**
- **Section dividers** using ASCII borders (used extensively):
  ```typescript
  // ─── Intent Detection ────────────────────────────────────────────────────
  function detectIntent(message: string): 'complaint' | 'maid_hire' | 'helper_reg' | 'general' {
  ```

- **Explain "why" not "what"** (code structure is self-documenting):
  ```typescript
  // Skip price blocking for salary acknowledgments (user-provided amount being confirmed)
  const isSalaryAck = /got it|noted|salary|budget/i.test(cleaned) &&
                      /₹|per month|per\s+month/i.test(cleaned);
  ```

- **Complex regex patterns get inline explanation:**
  ```typescript
  // Indian phone validation (6-9 start, 10 digits)
  const phonePattern = /(?<!\w)\d{10}(?!\w)/g;
  ```

- **NARROW vs open-ended prompts noted:**
  ```typescript
  // ─── State Machine System Prompt ─────────────────────────────────────────────
  // This is a NARROW prompt — tells the LLM exactly what to say, not open-ended.
  function buildStateMachinePrompt(...) {
  ```

- **Known limitations/workarounds documented:**
  ```typescript
  // Reset lastIndex since .test() with /g flag advances it
  pattern.lastIndex = 0;
  ```

**JSDoc/TSDoc:**
- **Not used** for most functions (self-documenting code preferred)
- Function signatures have inline type annotations instead
- `@param`, `@returns` comments are absent; types tell the story

## Function Design

**Size:**
- Functions kept small: 5-40 lines typical
- Complex flows broken into helper functions (e.g., `detectIntent()` is ~25 lines, validation functions are 1-3 lines)

**Parameters:**
- Single object parameter for functions with 3+ params:
  ```typescript
  // Good: object parameter
  export async function logLLMInteraction(data: {
    conversationId: string;
    intent: string;
    systemPrompt: string;
    userMessage: string;
    fullHistory: any[];
    rawResponse: string;
    cleanedResponse: string;
    tookMs: number;
  })

  // Good: positional args for 2 params
  function validateLocation(value: string | null | undefined): boolean
  ```

**Return Values:**
- **Explicit types always specified:**
  ```typescript
  function detectIntent(message: string): 'complaint' | 'maid_hire' | 'helper_reg' | 'general'
  function extractPhone(text: string): string | null
  function applyStrictGuardrails(text: string): string
  function validatePhone(text: string): string | null
  ```

- **Nullable returns for extractors:** Functions return `null` if extraction fails
- **Union types for state/intent:** `'complaint' | 'maid_hire' | 'helper_reg' | 'general'`
- **Object returns for complex results:** `ProcessResult`, `ExtractedSlots`

## Module Design

**Exports:**
- **Barrel files not used** — files export only what they define
- **Each file has single responsibility:**
  - `guardrails.ts`: Response filtering
  - `dataExtractor.ts`: Slot/intent extraction
  - `BaseFlow.ts`: State machine base class + types
  - `MaidHiringFlow.ts`: Maid hiring flow implementation

**File Structure:**
- Interfaces/types defined at top
- Helper functions (private, no export) defined before public functions
- Export statements use `export function`, `export interface`, `export class`, `export const`
- No `export { }` style re-exports

**Example from `src/flows/MaidHiringFlow.ts`:**
```typescript
// Imports at top
import { BaseFlow, FlowState, CollectedData, StepDefinition } from './BaseFlow';

// Constants
const BENGALURU_AREAS = [...]
const SERVICE_TYPES = [...]

// Private helpers
function validateLocation(value): boolean
function validateServiceType(value): boolean

// Public export
export class MaidHiringFlow extends BaseFlow {
  defineSteps(): void { ... }
}
```

## Specific Conventions

**Non-null assertions:**
- Used for env vars known to exist: `process.env.NEXT_PUBLIC_SUPABASE_URL!`
- Avoids unnecessary null checks for Vercel-provided environment variables

**`any` type:**
- Used sparingly but present for:
  - Message history (heterogeneous types): `fullHistory: any[]`
  - Dynamic DB responses: `function loadStateMachineSession(conversationId: string, dbSession: any)`
  - Legacy patterns in date handling

**Destructuring:**
- Preferred for extracting object properties: `const { data, error } = await supabase.from(...)`
- Consistent with Supabase SDK patterns

**Template literals:**
- Used for multi-line text (prompts, logs):
  ```typescript
  return `ROLE: EzyBot — domestic help intake assistant

  COLLECTED SO FAR: ${collected || 'Nothing yet'}

  INSTRUCTION: ${llmInstruction}`
  ```

---

*Convention analysis: 2026-02-27*
