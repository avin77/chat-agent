# Testing Patterns

**Analysis Date:** 2026-02-27

## Test Framework

**Runner:**
- **No framework installed** (Jest, Vitest, Mocha not in dependencies)
- Testing approach: **Ad-hoc Node.js scripts + manual eval**
- Roadmap notes: "[x] Add vitest test framework" (planned but not yet implemented)

**Test Files:**
- Standalone scripts in project root: `test-*.ts` and `test-*.js` files
- Examples: `test-guardrails.ts`, `test-multi-turn.ts`, `test-email.ts`, `test-chat-integration.ts`
- Evaluation framework: `eval.js` (main test orchestrator)
- Not integrated into CI/CD pipeline yet

**Run Commands:**
```bash
npm run eval                   # Run against local dev server
npm run eval:prod             # Run against live Vercel URL
npm run eval:verbose          # Same as prod but shows full conversation output
npm run eval:whatsapp         # Compact output for WhatsApp reporting
npm run eval:json             # Save full results to timestamped JSON
npm run eval:state            # Test state machine (maid_hire intent only)
npm run eval:state:prod       # State machine eval against production
npm run eval:state:verbose    # State machine eval with detailed output
npm run eval:state:json       # State machine eval with JSON export
```

## Test File Organization

**Location:**
- Project root: `test-*.ts` and `test-*.js` files (not co-located with source)
- Evaluation data: `data/` directory
  - `data/state-golden-dataset.json` — Ground truth for state machine tests (28 conversations)
  - `data/golden-dataset.jsonl` — Gemini-generated ideal responses
  - `data/eval-state-2026-*.json` — Timestamped evaluation results
  - `data/golden-review.csv` — CSV for manual review of golden dataset

**Naming:**
- Ad-hoc test files: `test-[feature].ts` (e.g., `test-guardrails.ts`)
- Evaluation scripts: `[action]-[subject].js` (e.g., `eval.js`, `capture-real-responses.js`)
- Configuration: `promptfoo.yaml` (for prompt evaluation)

## Test Structure

**Pattern from `test-guardrails.ts` (simple unit test):**
```typescript
import { extractName, validatePhone } from './src/lib/guardrails';

const testCases = [
    { name: 'Standard Name', input: 'My name is John Doe', expected: 'John Doe' },
    { name: 'Short Name', input: 'I am JH', expected: 'JH' },
];

console.log('--- TEST: Name Extraction ---');
testCases.forEach(t => {
    const result = extractName(t.input);
    const status = result?.toLowerCase() === t.expected.toLowerCase() ? '✅' : '❌';
    console.log(`${status} [${t.name}] Input: "${t.input}" -> Got: "${result}" (Expected: "${t.expected}")`);
});
```

**Pattern from `eval.js` (multi-turn conversation test):**
```javascript
const TEST_CASES = [
    {
        id: 'faq_01',
        name: 'User asks if 24hr maid available',
        category: 'FAQ',
        turns: [
            {
                user: 'first you share you have 24 hurs maid ?',
                checks: {
                    contains: ['yes', 'full-time', '24'],
                    notContains: ['which area', 'phone number'],
                }
            }
        ]
    },
];
```

**Assertion Patterns:**
- **Simple equality checks:** `result?.toLowerCase() === expected.toLowerCase()`
- **Behavioral assertions:** Response must `contain` specific keywords and NOT `contain` others
- **Intent detection assertions:** Test case includes `intent` field to verify correct flow taken
- **Escalation assertions:** `shouldEscalate` boolean to check `[ESCALATE]` tag presence

## Mocking

**Framework:** No dedicated mocking library

**Patterns:**

**Environment-based fallback (preferred for external services):**
```typescript
// From src/lib/email.ts
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    try {
        // Use Gmail SMTP
        const transporter = nodemailer.createTransport({...});
        const info = await transporter.sendMail({...});
        return { success: true, id: info.messageId };
    } catch (error) {
        console.error('📧 [GMAIL] Failed:', error);
        return { success: false, error };
    }
}

// Fallback: Mock mode
console.log('📧 [MOCK EMAIL] To:', recipients.join(', '));
return { success: true, id: 'mock-id' };
```

**DEMO_MODE flag (environment-based):**
```typescript
// Tested but not widely used yet
// Set DEMO_MODE=true to skip external API calls
if (process.env.DEMO_MODE === 'true') {
    // Return mock response
}
```

**Manual test doubles in test files:**
```typescript
// From eval.js
const BASE_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
    || process.argv[process.argv.indexOf('--url') + 1]?.startsWith('http') && process.argv[process.argv.indexOf('--url') + 1]
    || 'http://localhost:3000';  // Local dev server fallback
```

**What to Mock:**
- **External APIs:** Email, SMS, Gemini (wrap in try-catch with fallback)
- **Database operations:** Test Supabase calls with real DB (integration tests)
- **Rate limiters:** Use mock timestamps for testing backoff logic

**What NOT to Mock:**
- **Regex extractors:** Test with real strings (no mocking needed)
- **State machine logic:** Test with real `BaseFlow` instances
- **Guardrails:** Test with real response text
- **Response parsing:** Test with actual LLM outputs (from golden dataset)

## Fixtures and Factories

**Test Data:**

**Structured data for unit tests:**
```typescript
// From test-guardrails.ts
const testCases = [
    { name: 'Standard Name', input: 'My name is John Doe', expected: 'John Doe' },
    { name: 'Short Name', input: 'I am JH', expected: 'JH' },
];

const phoneCases = [
    { input: '9876543210', valid: true },
    { input: 'My phone is 9876543210', valid: true },
    { input: '12345', valid: false },
];
```

**Golden dataset for integration tests:**
- Location: `data/state-golden-dataset.json`
- Format: Array of 28 conversation objects
- Each conversation has `id`, `name`, `category`, `turns[]` with `user` and expected bot behavior
- Example structure:
  ```json
  {
    "id": "maid_01",
    "name": "Happy path maid hire",
    "category": "Maid Hiring",
    "turns": [
      { "user": "Hi", "role": "start_maid_flow" },
      { "user": "9876543210", "role": "phone_provided" },
      ...
    ]
  }
  ```

**Location:**
- Test fixtures: `data/state-golden-dataset.json` (checked into repo)
- Real response captures: `data/real-responses-review.csv` (generated by `capture` script)
- Eval results: `data/eval-state-YYYY-MM-DDTHH-mm-ss-sssZ.json` (timestamped, generated by eval runs)

## Coverage

**Requirements:** No coverage threshold enforced

**View Coverage:**
- No dedicated coverage tool (Jest/Vitest not installed)
- Manual review via test case pass/fail counts in `eval.js` output

**Coverage Metrics Tracked (from eval results):**
```
- Pass rate (%)
- Average response latency (ms)
- Max response latency (ms)
- Per-category breakdown (FAQ, Maid Hire, Complaint, etc.)
- Individual test failures with root cause
```

**Example output:**
```
Eval Score: 98% PRODUCTION READY (28/28 tests pass, 115 turns, 5 failures fixed)
Avg Response Time: 1200ms | Max: 2500ms
- FAQ: 14/14 pass
- Maid Hire: 10/10 pass
- Complaint: 4/4 pass
```

## Test Types

**Unit Tests:**
- **Scope:** Individual extractor functions, guardrails, validators
- **Approach:** Run function with known input, assert output
- **Examples:**
  - `test-guardrails.ts`: Tests `extractName()`, `validatePhone()`
  - `test-email-logic.ts`: Tests email address parsing
  - Regex extraction patterns tested with sample strings

**Integration Tests:**
- **Scope:** Multi-turn conversations, state machine flows, end-to-end intents
- **Approach:** Send sequence of messages via API, assert conversation progresses correctly
- **Examples:**
  - `test-multi-turn.ts`: Tests 5-message conversation completion
  - `eval.js`: Tests 28+ conversations across 4 intents
  - `test-chat-integration.ts`: Tests chat widget + API interaction

**E2E Tests (UI):**
- **Framework:** Playwright (configured but not run by default)
- **Location:** `/workspace/group/chatbot-eval.spec.js` (in separate Docker environment)
- **Scope:** Opens live Vercel URL in browser, types messages, validates visible responses
- **Run by:** Andy (NanoClaw) on request with `npm run playwright eval`
- **Output:** Screenshots saved to `/workspace/group/eval-screenshots/`
- **Not run locally** — requires Playwright environment

## Common Patterns

**Async Testing:**

**Pattern from `test-multi-turn.ts` (simulating multi-turn flow):**
```typescript
async function testMultiTurn() {
    const conversationId = 'test-' + Date.now();
    const messages = [
        'Hi, I need a maid',
        '9876543210',
        'Koramangala',
        'Cooking',
        '24-hour',
        '15000',
    ];

    for (const msg of messages) {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversationId,
                messages: [{ role: 'user', content: msg }],
            }),
        });
        const result = await response.json();
        console.log(`Turn: "${msg}" → "${result.response}"`);
    }
}

testMultiTurn().catch(console.error);
```

**Pattern from eval.js (assertion-based):**
```javascript
for (const testCase of TEST_CASES) {
    const response = await sendMessage(BASE_URL, conversationId, testCase.turns[0].user);
    const checks = testCase.turns[0].checks;

    const hasMissing = checks.contains.some(keyword =>
        !response.toLowerCase().includes(keyword.toLowerCase())
    );
    const hasBlocked = checks.notContains?.some(keyword =>
        response.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasMissing || hasBlocked) {
        console.log(`❌ FAIL [${testCase.id}] ${testCase.name}`);
        failures.push(testCase);
    } else {
        console.log(`✅ PASS [${testCase.id}] ${testCase.name}`);
    }
}
```

**Error Testing:**

**Pattern (testing guardrails error cases):**
```typescript
// From test-guardrails.ts
const phoneCases = [
    { input: '12345', valid: false },           // Too short
    { input: '999999999', valid: false },       // 9 digits
    { input: '99999 99999', valid: false },     // Space in number
];

phoneCases.forEach(t => {
    const res = validatePhone(t.input);
    const isValid = !!res;
    const status = isValid === t.valid ? '✅' : '❌';
    console.log(`${status} Input: "${t.input}" -> Valid: ${isValid}`);
});
```

**Pattern (testing invalid intent detection):**
```typescript
// From eval.js
{
    id: 'faq_04',
    name: 'City outside Bengaluru',
    turns: [
        {
            user: 'Do you provide service in Mumbai?',
            checks: {
                contains: ['bengaluru', 'only'],
                notContains: ['yes we do', 'available in mumbai'],  // Ensure no false positive
            }
        }
    ]
}
```

## Test Execution

**Running locally:**
```bash
# Start dev server first
npm run dev

# In another terminal, run eval
npm run eval              # Tests against localhost:3000

# Or test production
npm run eval:prod         # Tests against live Vercel URL
```

**From Andy (WhatsApp bot):**
```
Ask Andy: "run eval"      # Runs npm run eval:whatsapp, posts score + failures
Ask Andy: "run playwright eval"  # Runs Playwright UI tests in container
```

**CI/CD Integration:**
- Not yet integrated into GitHub Actions
- Deployments via `bash deploy.sh` trigger Vercel builds (no test gate)
- Manual eval verification before marking production-ready

## Test Quality Metrics

**Current Status (Feb 2026):**
- **Eval Score:** 98% PRODUCTION READY
- **Last Eval:** `data/eval-state-2026-02-24T14-28-16-898Z.json`
- **Test Count:** 28 conversations, 115 turns total
- **Pass Rate:** 28/28 tests (5 previously failing, now fixed)
- **Response Latency:** Avg 1200ms, Max 2500ms

**Verdict Thresholds:**
- ≥90% = Production Ready
- 70-89% = Needs Improvement
- <70% = Not Ready

**Known Gaps:**
- No unit test framework (Jest/Vitest) — all tests are ad-hoc
- No CI/CD test gates — tests run manually before deploy
- No code coverage tracking
- Playwright E2E tests not integrated into main CI pipeline

---

*Testing analysis: 2026-02-27*
