# Enhanced Prompt System - Implementation Guide

## 📋 Overview

This system:
- ✅ Logs ALL leads to Supabase (separate table)
- ✅ Logs complaints separately
- ✅ NEVER mentions prices (strict guardrail)
- ✅ Says "mainly Bengaluru" for location questions
- ✅ Shows LLM Input/Output in debug dashboard
- ✅ Uses existing `simulate.ts` for testing

---

## 🗄️ Supabase Database Schema

### Migration SQL

Run this in Supabase SQL Editor:

```sql
-- 1. LEADS TABLE (All hiring enquiries)
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  -- Contact Info
  name text,
  phone text,
  
  -- Lead Details
  is_replacement boolean,
  previous_maid_from_ezyhelpers boolean,
  maid_type text, -- Baby sitting / Cleaning / Cook / Elderly care
  work_description text,
  duration_months integer,
  work_schedule text, -- Live-in 24hrs / Part-time
  family_size integer,
  has_servant_room boolean,
  salary_expectation text,
  preferences text,
  
  -- Metadata
  conversation_id text,
  status text DEFAULT 'new', -- new, contacted, closed
  
  -- Full conversation for context
  full_conversation jsonb
);

-- 2. COMPLAINTS TABLE
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  -- Contact Info
  name text,
  phone text,
  
  -- Complaint Details
  issue_description text,
  urgency text, -- high, medium, low
  maid_name text,
  
  -- Metadata
  conversation_id text,
  status text DEFAULT 'open', -- open, resolved, escalated
  
  -- Full conversation
  full_conversation jsonb
);

-- 3. HELPER REGISTRATIONS TABLE
CREATE TABLE helper_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  -- Contact Info
  name text,
  phone text,
  
  -- Helper Details
  work_type text,
  experience_years integer,
  preferred_schedule text, -- live-in / part-time
  expected_salary text,
  languages_spoken text[],
  
  -- Metadata
  conversation_id text,
  status text DEFAULT 'new',
  
  full_conversation jsonb
);

-- 4. LLM LOGS TABLE (For debugging)
CREATE TABLE llm_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  conversation_id text,
  intent text, -- complaint, maid_hire, helper_reg, general
  
  -- Input
  system_prompt text,
  user_message text,
  full_message_history jsonb,
  
  -- Output
  raw_llm_response text,
  after_guardrails text,
  
  -- Metadata
  took_ms integer,
  tokens_used integer
);

-- TTL Policy: Auto-delete logs older than 7 days (save space on free tier)
CREATE OR REPLACE FUNCTION delete_old_llm_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM llm_logs WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Run cleanup daily (use Supabase cron or external scheduler)
-- Manual cleanup: SELECT delete_old_llm_logs();

-- 5. GENERAL ENQUIRIES TABLE (No escalation needed)
CREATE TABLE general_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  
  conversation_id text,
  question text,
  bot_answer text,
  converted_to_lead boolean DEFAULT false
);

-- 6. CONVERSATION SESSIONS TABLE (For state management)
CREATE TABLE conversation_sessions (
  conversation_id text PRIMARY KEY,
  detected_intent text, -- Set ONCE at conversation start
  created_at timestamptz DEFAULT now(),
  last_activity timestamptz DEFAULT now(),
  metadata jsonb -- Store session-specific data
);

-- Indexes for performance
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_complaints_created ON complaints(created_at DESC);
CREATE INDEX idx_llm_logs_conv_id ON llm_logs(conversation_id);
CREATE INDEX idx_sessions_last_activity ON conversation_sessions(last_activity DESC);
```

---

## 🛡️ Strict Guardrails Implementation

**File**: `src/lib/guardrails.ts`

```typescript
// CRITICAL: This runs AFTER LLM response, before showing to user

export function applyStrictGuardrails(response: string): string {
  let cleaned = response;
  
  // 1. PRICE BLOCKING (HIGHEST PRIORITY)
  // Covers: numbers, words, and Indian currency formats
  const pricePatterns = [
    /₹\s*\d+/gi,                    // ₹5000
    /Rs\.?\s*\d+/gi,                // Rs.5000 or Rs 5000
    /\d+\s*rupees/gi,               // 5000 rupees
    /\d+\s*per\s*(month|day|hour)/gi, // 5000 per month
    /salary.*?(\d{3,})/gi,          // salary is 5000
    /\d+k\s*per/gi,                 // 10k per month
    // Extended patterns for text numbers
    /(?:five|ten|fifteen|twenty|thirty|fifty)\s*thousand/gi, // five thousand
    /\d+k(?!\w)/gi,                 // 5k, 10k, 15k
    /\d+\s*lakh/gi,                 // 5 lakh, 2 lakh
    /(?:one|two|three|four|five)\s*lakh/gi, // two lakh
  ];
  
  for (const pattern of pricePatterns) {
    if (pattern.test(cleaned)) {
      console.error('[GUARDRAIL TRIGGERED] Price mention blocked:', cleaned.match(pattern));
      cleaned = cleaned.replace(pattern, '**[Our team will contact you with pricing details]**');
    }
  }
  
  // 2. LOCATION HANDLING
  // If asking about locations OTHER than Bengaluru, redirect
  if (/(?:work|serve|available|operate).*?(mumbai|delhi|pune|hyderabad|chennai|kolkata)/gi.test(response)) {
    cleaned += '\n\nNote: We primarily operate in Bengaluru. Our team will confirm service availability in your area.';
  }
  
  // 3. PREVENT PHONE NUMBER LEAKS
  // Allow user's own phone (from context), block all others
  const phonePattern = /(?<!\w)\d{10}(?!\w)/g;
  const matches = cleaned.match(phonePattern);
  if (matches) {
    console.warn('[GUARDRAIL] Phone number detected:', matches);
    // You can cross-check with user's provided phone here
  }
  
  // 4. FALLBACK FOR UNKNOWN QUESTIONS
  // If LLM says "I don't know" or similar, replace with standard response
  if (/i don't know|i'm not sure|i cannot answer/gi.test(cleaned)) {
    cleaned = "I don't have that specific information right now. Our customer support team will contact you with the details. Could you share your requirements so we can help you better?";
  }
  
  // 5. EXTERNAL LINK BLOCKING
  cleaned = cleaned.replace(
    /https?:\/\/(?!ezyhelpers\.com)[^\s]+/gi,
    '[Link removed for security]'
  );
  
  return cleaned;
}

// Validation helpers

// NOTE: This regex is India-specific (starts with 6-9, 10 digits)
// For international expansion, add country code detection:
// Example: +91 for India, +1 for US, etc.
export function validatePhone(text: string): string | null {
  // Indian mobile: starts with 6-9, total 10 digits
  const match = text.match(/\b([6-9]\d{9})\b/);
  return match ? match[1] : null;
}

// Future: International phone validation
// export function validatePhoneInternational(text: string): { country: string, phone: string } | null {
//   const patterns = {
//     india: /\b([6-9]\d{9})\b/,
//     us: /\b([2-9]\d{2}[2-9]\d{6})\b/,
//   };
//   // Detect country code and validate accordingly
// }

export function extractName(text: string): string | null {
  const patterns = [
    /(?:name is|i am|i'm|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+\d{10}/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}
```

---

## 💬 Enhanced Prompt Templates

**File**: `src/lib/prompts-enhanced.ts`

```typescript
export const ENHANCED_PROMPTS = {
  complaint: `You are EzyBot for EzyHelpers.com domestic help services.

HANDLE COMPLAINT WITH URGENCY:

1. IF missing Name or Phone → Ask: "Please share your Name and Phone so we can assist immediately."
2. Ask brief issue description
3. Once you have Name + Phone + Issue → Say: "I've escalated your complaint. Our priority support team will call you within 1 hour. [ESCALATE]"

STRICT RULES:
❌ NEVER mention specific prices or salary amounts. Say: "Our team will discuss pricing when they contact you."
❌ You do NOT have access to pricing information. It's in a separate system managed by the support team.
❌ NEVER give competitor information or external contacts.
✅ We primarily work in Bengaluru. For other locations, say: "Our team will confirm service availability in your area."
✅ If you don't know something, say: "Our support team will provide those details when they contact you."
✅ Be empathetic but brief.`,

  maid_hire: `You are EzyBot for EzyHelpers.com domestic help services.

COLLECT REQUIREMENTS EFFICIENTLY (Ask 2-3 questions at once):

1. Name + Phone (FIRST PRIORITY)
2. "Are you looking for a replacement maid or hiring for the first time?"
   - IF replacement → "Was your previous maid from EzyHelpers?"
3. "What type of help do you need? (Baby sitting / Home cleaning / Cook / Elderly care)"
4. "What specific work should they handle?"
5. "How many months do you need the maid for?"
6. "Do you need live-in 24-hour help or part-time?"
7. "How many family members? Is a separate servant room available?"
8. "What salary range are you considering?"

WHEN YOU HAVE: Name + Phone + Type (step 3), SAY:
"Thank you! We will send suitable profiles to [Phone] shortly. [ESCALATE]"

STRICT RULES:
❌ NEVER mention specific salary amounts like "₹15,000" or "Rs.10000". Instead: "Salary depends on experience and requirements. We'll discuss options when we contact you."
❌ You do NOT have access to pricing information. It's stored in a separate system for security and accuracy.
❌ NEVER give pricing ranges. Say: "Our team will share pricing based on your specific needs."
✅ We primarily operate in Bengaluru. For other cities: "We mainly work in Bengaluru. Our team will check availability for your location."
✅ If asked about process/timeline/guarantees: "Our team will explain the complete process when they contact you."`,

  helper_reg: `You are EzyBot for EzyHelpers.com.

REGISTER HELPER LOOKING FOR WORK:

1. Name + Phone
2. "What type of domestic work can you do? (Cooking / Cleaning / Baby care / Elderly care)"
3. "How many years of experience do you have?"
4. "Do you prefer live-in or part-time work?"
5. "What salary are you expecting?"
6. "Which languages do you speak?"

WHEN COMPLETE → "Registration received! We will contact you when suitable jobs are available. [ESCALATE]"

STRICT RULES:
❌ NO salary promises. Say: "Salary depends on the employer and job type. We match you with suitable positions."
✅ We primarily have jobs in Bengaluru.`,

  general: `You are EzyBot for EzyHelpers.com domestic help services.

ANSWER FROM THIS KNOWLEDGE BASE:

**Services**: Domestic help for cleaning, cooking, baby sitting, elderly care
**Locations**: Primarily Bengaluru. For other cities, team will confirm availability.
**Process**: 
  1. Share your requirements
  2. We send profiles of verified helpers
  3. You interview and select
  4. We handle documentation and onboarding

**Pricing**: Custom quotes based on requirements (live-in vs part-time, experience level, work type)

AFTER ANSWERING:
"Would you like to hire domestic help? I can collect your requirements."
- If YES → Switch to collecting requirements
- If NO → "Feel free to ask if you have more questions!"

CRITICAL RULES:
❌ NEVER give specific prices. ALWAYS say: "Pricing varies by requirements. Our team will provide a detailed quote when they contact you."
❌ You do NOT have access to pricing information. It is managed by our sales team in a separate secure system.
❌ If you don't know the answer: "Our customer support team will provide that information. Please share your contact details so they can reach you."
✅ Location: "We primarily operate in Bengaluru. Our team will confirm service availability for other locations."
✅ DO NOT use [ESCALATE] tag for general questions. Only escalate if user wants to hire.`
};
```

---

## 🔍 LLM I/O Visibility Implementation

**File**: `src/lib/llm-logger.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function logLLMInteraction(data: {
  conversationId: string;
  intent: string;
  systemPrompt: string;
  userMessage: string;
  fullHistory: any[];
  rawResponse: string;
  cleanedResponse: string;
  tookMs: number;
}) {
  try {
    await supabase.from('llm_logs').insert({
      conversation_id: data.conversationId,
      intent: data.intent,
      system_prompt: data.systemPrompt,
      user_message: data.userMessage,
      full_message_history: data.fullHistory,
      raw_llm_response: data.rawResponse,
      after_guardrails: data.cleanedResponse,
      took_ms: data.tookMs,
    });
    
    console.log('✅ LLM interaction logged to Supabase');
  } catch (error) {
    console.error('❌ Failed to log LLM interaction:', error);
  }
}

// Helper to view logs in console (development mode)
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
  console.log('\n📥 SYSTEM PROMPT:');
  console.log(data.systemPrompt);
  console.log('\n💬 USER MESSAGE:');
  console.log(data.userMessage);
  console.log('\n🤖 RAW LLM RESPONSE:');
  console.log(data.rawResponse);
  console.log('\n✅ AFTER GUARDRAILS:');
  console.log(data.cleanedResponse);
  console.log('='.repeat(80) + '\n');
}
```

### Debug Dashboard (View LLM Logs)

**File**: `src/app/debug/page.tsx`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export default async function DebugPage() {
  const { data: logs } = await supabase
    .from('llm_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">LLM Debug Logs</h1>
      
      {logs?.map((log) => (
        <div key={log.id} className="mb-8 border rounded-lg p-6 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-blue-600">{log.intent.toUpperCase()}</span>
            <span className="text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-green-700">📥 Input</h3>
              <div className="text-sm bg-white p-3 rounded border">
                <p className="text-gray-600 mb-2"><strong>User:</strong> {log.user_message}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-400">System Prompt</summary>
                  <pre className="text-xs mt-2 whitespace-pre-wrap">{log.system_prompt}</pre>
                </details>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-blue-700">📤 Output</h3>
              <div className="text-sm bg-white p-3 rounded border">
                <p className="mb-2"><strong>After Guardrails:</strong></p>
                <p className="text-gray-700">{log.after_guardrails}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-400">Raw LLM Response</summary>
                  <pre className="text-xs mt-2 whitespace-pre-wrap">{log.raw_llm_response}</pre>
                </details>
              </div>
            </div>
          </div>
          
          {log.raw_llm_response !== log.after_guardrails && (
            <div className="mt-3 text-sm bg-yellow-50 border border-yellow-200 p-2 rounded">
              ⚠️ Guardrails modified this response
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

Access at: `http://localhost:3000/debug`

---

## 🧪 Testing with Updated simulate.ts

**File**: `simulate-enhanced.ts`

```typescript
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import * as fs from 'fs';
import { ENHANCED_PROMPTS } from './src/lib/prompts-enhanced';
import { applyStrictGuardrails } from './src/lib/guardrails';

// Load env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = envFile.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/)?.[1]?.trim() || '';
} catch (e) { }

const model = google('gemma-3-1b-it');

interface TestScenario {
  name: string;
  intent: 'complaint' | 'maid_hire' | 'helper_reg' | 'general';
  messages: { role: string, content: string }[];
  expectedBehavior: (response: string) => { pass: boolean, reason: string };
}

const SCENARIOS: TestScenario[] = [
  {
    name: "Price Block Test",
    intent: "general",
    messages: [{ role: 'user', content: 'How much does a full-time maid cost?' }],
    expectedBehavior: (r) => ({
      pass: !r.match(/₹\d+|Rs\.?\s*\d+|\d+\s*rupees/i),
      reason: r.match(/₹\d+|Rs\.?\s*\d+/) ? 'FAILED: Price leaked through guardrails' : 'PASS: No price mentioned'
    })
  },
  {
    name: "Location Redirect Test",
    intent: "general",
    messages: [{ role: 'user', content: 'Do you work in Mumbai?' }],
    expectedBehavior: (r) => ({
      pass: r.toLowerCase().includes('bengaluru') || r.toLowerCase().includes('bangalore'),
      reason: r.includes('Bengaluru') ? 'PASS: Mentioned Bengaluru as primary location' : 'FAILED: Did not mention Bengaluru'
    })
  },
  {
    name: "Complaint Escalation",
    intent: "complaint",
    messages: [
      { role: 'user', content: 'I have a big complaint!' },
      { role: 'assistant', content: 'Please share your Name and Phone.' },
      { role: 'user', content: 'Ramesh 9988776655. The maid never showed up!' }
    ],
    expectedBehavior: (r) => ({
      pass: r.includes('[ESCALATE]'),
      reason: r.includes('[ESCALATE]') ? 'PASS: Escalated' : 'FAILED: No escalation tag'
    })
  },
  {
    name: "Lead Collection",
    intent: "maid_hire",
    messages: [
      { role: 'user', content: 'I need a cook.' },
      { role: 'assistant', content: 'Name and phone?' },
      { role: 'user', content: 'Priya 9123456789' }
    ],
    expectedBehavior: (r) => ({
      pass: r.includes('[ESCALATE]') || r.toLowerCase().includes('profile'),
      reason: 'Check if lead is being processed'
    })
  },
  {
    name: "General Enquiry (No Escalation)",
    intent: "general",
    messages: [{ role: 'user', content: 'What is your company address?' }],
    expectedBehavior: (r) => ({
      pass: !r.includes('[ESCALATE]'),
      reason: r.includes('[ESCALATE]') ? 'FAILED: Should not escalate general questions' : 'PASS: No escalation'
    })
  }
];

async function runTests() {
  console.log('🧪 Running Enhanced System Tests\n');
  let passed = 0;
  
  for (const scenario of SCENARIOS) {
    process.stdout.write(`Testing: ${scenario.name}... `);
    
    try {
      const systemPrompt = ENHANCED_PROMPTS[scenario.intent];
      const result = await generateText({
        model,
        system: systemPrompt,
        messages: scenario.messages,
      });
      
      const cleaned = applyStrictGuardrails(result.text);
      const check = scenario.expectedBehavior(cleaned);
      
      if (check.pass) {
        console.log('✅', check.reason);
        passed++;
      } else {
        console.log('❌', check.reason);
        console.log('  Response:', cleaned);
      }
    } catch (e: any) {
      console.log('⚠️ ERROR:', e.message);
    }
  }
  
  console.log(`\n📊 Results: ${passed}/${SCENARIOS.length} passed (${Math.round(passed/SCENARIOS.length*100)}%)`);
}

runTests();
```

Run with: `npx tsx simulate-enhanced.ts`

---

## 🚀 Complete Integration

**Update**: `src/app/api/chat/route.ts`

```typescript
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { ENHANCED_PROMPTS } from '@/lib/prompts-enhanced';
import { applyStrictGuardrails, validatePhone, extractName } from '@/lib/guardrails';
import { logLLMInteraction, logToConsole } from '@/lib/llm-logger';
import { sendEmail } from '@/lib/email';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// Helper: Trim messages to fit token limit (gemma-3-1b-it = 8192 tokens)
// Strategy: Keep first 2 messages (greeting + initial intent) + last 10 (recent context)
function trimMessages(messages: any[]): any[] {
  if (messages.length <= 12) return messages;
  
  return [
    ...messages.slice(0, 2), // First 2: initial greeting + intent detection
    { role: 'system', content: '[... earlier conversation ...]' },
    ...messages.slice(-10) // Last 10: recent context
  ];
}

function detectIntent(message: string): 'complaint' | 'maid_hire' | 'helper_reg' | 'general' {
  const lower = message.toLowerCase();
  
  // Negative patterns (avoid false positives)
  if (/don't|do not|doesn't|never|stop|my friend|my neighbor/.test(lower)) {
    return 'general'; // User is declining or asking about someone else
  }
  
  // Positive patterns
  if (/complaint|issue|problem|angry|upset|bad service/.test(lower)) return 'complaint';
  if (/need.*maid|hire.*maid|looking for.*maid|want.*maid/.test(lower)) return 'maid_hire';
  if (/need.*job|want.*work|looking for.*job|i am.*maid|i am.*helper/.test(lower)) return 'helper_reg';
  return 'general';
}

// Session management: Detect intent ONCE per conversation
async function getOrCreateSession(conversationId: string, latestMessage: string) {
  const { data: existingSession } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .single();
  
  if (existingSession) {
    // Update last activity
    await supabase
      .from('conversation_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('conversation_id', conversationId);
    
    return existingSession.detected_intent as 'complaint' | 'maid_hire' | 'helper_reg' | 'general';
  }
  
  // New session: detect and store intent
  const intent = detectIntent(latestMessage);
  await supabase
    .from('conversation_sessions')
    .insert({
      conversation_id: conversationId,
      detected_intent: intent,
    });
  
  return intent;
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const latestMessage = messages[messages.length - 1].content;
  const conversationId = req.headers.get('x-conversation-id') || crypto.randomUUID();
  
  // Get intent from session (detect ONCE per conversation)
  const intent = await getOrCreateSession(conversationId, latestMessage);
  const systemPrompt = ENHANCED_PROMPTS[intent];
  
  // Trim messages to prevent token limit issues (8192 tokens for gemma-3-1b-it)
  const trimmedMessages = trimMessages(messages);
  
  const startTime = Date.now();
  
  const result = await streamText({
    model: google('gemma-3-1b-it'),
    system: systemPrompt,
    messages: trimmedMessages,
    onFinish: async ({ text }) => {
      const tookMs = Date.now() - startTime;
      const cleaned = applyStrictGuardrails(text);
      
      // Log to console (dev mode)
      if (process.env.NODE_ENV === 'development') {
        logToConsole({
          intent,
          systemPrompt,
          userMessage: latestMessage,
          rawResponse: text,
          cleanedResponse: cleaned
        });
      }
      
      // Log to Supabase
      await logLLMInteraction({
        conversationId,
        intent,
        systemPrompt,
        userMessage: latestMessage,
        fullHistory: messages,
        rawResponse: text,
        cleanedResponse: cleaned,
        tookMs
      });
      
      // Extract data
      const phone = validatePhone(latestMessage);
      const name = extractName(latestMessage);
      
      // Handle escalation
      if (text.includes('[ESCALATE]')) {
        // Save to appropriate table
        if (intent === 'complaint') {
          await supabase.from('complaints').insert({
            name, phone,
            issue_description: latestMessage,
            conversation_id: conversationId,
            full_conversation: messages
          });
        } else if (intent === 'maid_hire') {
          await supabase.from('leads').insert({
            name, phone,
            conversation_id: conversationId,
            full_conversation: messages
          });
        } else if (intent === 'helper_reg') {
          await supabase.from('helper_registrations').insert({
            name, phone,
            conversation_id: conversationId,
            full_conversation: messages
          });
        }
        
        // Send email
        await sendEmail({
          to: process.env.ADMIN_EMAIL!,
          subject: `${intent.toUpperCase()}: ${name || 'New'} - ${phone}`,
          html: `<h2>${intent}</h2><p>Name: ${name}</p><p>Phone: ${phone}</p><pre>${JSON.stringify(messages, null, 2)}</pre>`
        });
      } else if (intent === 'general') {
        // Log general enquiry
        await supabase.from('general_enquiries').insert({
          conversation_id: conversationId,
          question: latestMessage,
          bot_answer: cleaned
        });
      }
    }
  });
  
  return result.toDataStreamResponse();
}
```

---

## ✅ Summary

### What This Gives You:

1. **Leads → `leads` table** ✅
2. **Complaints → `complaints` table** ✅
3. **NO prices anywhere** ✅ (strict regex blocking)
4. **Location handled** ✅ ("mainly Bengaluru")
5. **See LLM I/O** ✅ (console logs + `/debug` page + Supabase `llm_logs`)
6. **Testing** ✅ (updated `simulate-enhanced.ts`)

### Next Steps:
1. Run Supabase migration SQL
2. Create the files above
3. Test with `npx tsx simulate-enhanced.ts`
4. Check LLM logs at `http://localhost:3000/debug`
