// src/extractors/llmExtractor.ts
// Phase 1 Agentic: LLM-based structured slot extraction with regex fallback
// Server-only -- calls Gemini API via generateObject

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { ExtractedSlots, extractAllSlots, isValidPhone } from './dataExtractor';

// ─── ExtractionMeta: tracks per-field provenance + latency ───────────────────
export interface ExtractionMeta {
    sources: {
        phone?: 'llm' | 'regex';
        location?: 'llm' | 'regex';
        service_type?: 'llm' | 'regex';
        schedule?: 'llm' | 'regex';
        salary_range?: 'llm' | 'regex';
        family_size?: 'llm' | 'regex';
        has_experience?: 'llm' | 'regex';
    };
    latency_ms: number;
    llm_raw: ExtractedSlots | null; // what LLM returned before any merge
    fallback_triggered: boolean;
}

// ─── Field trust rules ────────────────────────────────────────────────────────
// phone → regex wins (deterministic digit extraction is more reliable)
// all others → LLM wins on conflict, regex fills LLM nulls
const REGEX_WINS_FIELDS = ['phone'] as const;
const LLM_WINS_FIELDS = ['location', 'service_type', 'schedule', 'salary_range', 'family_size', 'has_experience'] as const;

// ─── Zod schema for all 7 maid-hire slots ────────────────────────────────────
const slotsSchema = z.object({
    phone: z.string().nullable().describe('10-digit Indian mobile number (must start with 6-9, exactly 10 digits)'),
    location: z.string().nullable().describe('Area or locality in Bengaluru (e.g., Koramangala, Indiranagar, Whitefield). Correct spelling variants.'),
    service_type: z.enum(['Cooking', 'Cleaning', 'Baby Care', 'Elderly Care', 'Cooking & Cleaning']).nullable().describe('Type of domestic help needed'),
    schedule: z.enum(['24-hour Live-in', '12-hour Day']).nullable().describe('Maid schedule: 24-hour Live-in (stays at home) or 12-hour Day (morning to evening)'),
    salary_range: z.string().nullable().describe('Expected salary or budget mentioned (e.g., "15k", "Rs 12000", "15-20k")'),
    family_size: z.string().nullable().describe('Number of family members or people in the household'),
    has_experience: z.string().nullable().describe('Whether the user has hired domestic help before (Yes/No/specific details)'),
});

// ─── LLM-based structured slot extraction ────────────────────────────────────
export async function extractAllSlotsWithLLM(text: string): Promise<ExtractedSlots> {
    try {
        const { object } = await generateObject({
            model: google('gemma-3-27b-it'),
            schema: slotsSchema,
            prompt: `Extract information from this customer message for a domestic help service in Bengaluru, India.
Message: "${text}"

Extraction rules:
- phone: Extract 10-digit Indian mobile number only (digits 0-9 only, must start with 6-9). Strip country code (+91/91). Return ONLY the 10 digits. Null if no valid phone found.
- location: Extract any Bengaluru area/locality. Correct spelling variants (e.g., "Koramanagla" -> "Koramangala", "Indranagar" -> "Indiranagar", "Whitefeild" -> "Whitefield", "Maratahalli" -> "Marathahalli"). If location is outside Bengaluru, return null.
- service_type: Map to one of: "Cooking" (cook/khana/food), "Cleaning" (clean/safai/sweep), "Baby Care" (baby/nanny/child/baccha), "Elderly Care" (elderly/senior/old/parents), "Cooking & Cleaning" (both cook and clean).
- schedule: "24-hour Live-in" for full-time/live-in/stay-in/24hr/raat ko bhi; "12-hour Day" for part-time/12hr/morning/evening/half-day/daily visits.
- salary_range: Extract any salary/budget amount mentioned. Keep original text (e.g., "15k", "12000", "15-20k").
- family_size: Number of people in household (e.g., "4", "four", "family of 3"). Return as string.
- has_experience: "Yes" if hired before, "No" if first time, or specific details if given.

Return null for any field not clearly present. Do not infer or assume.`,
        });

        // Validate LLM-extracted phone (LLM might hallucinate or misformat)
        let phone = object.phone;
        if (phone) {
            const cleaned = phone.replace(/\D/g, '').slice(-10);
            phone = isValidPhone(cleaned) ? cleaned : null;
        }

        return {
            name: null, // name not needed for state machine; regex handles it if required
            phone,
            location: object.location,
            service_type: object.service_type,
            schedule: object.schedule,
            salary_range: object.salary_range,
            family_size: object.family_size,
            has_experience: object.has_experience,
        };
    } catch (error) {
        console.error('[LLM Extraction] Failed, falling back to regex:', (error as Error).message?.substring(0, 100));
        return extractAllSlots(text);
    }
}

// ─── Merge with conflict resolution ──────────────────────────────────────────
// Strategy: phone→regex wins, others→LLM wins on conflict, regex fills LLM nulls
// This is DIFFERENT from mergeSlots() which simply fills LLM nulls with regex values.
// mergeWithConflictResolution() enforces the trust hierarchy even when BOTH sources
// have a value (regex always wins for phone; LLM always wins for other fields).
export function mergeWithConflictResolution(
    llmSlots: ExtractedSlots,
    regexSlots: ExtractedSlots
): ExtractedSlots {
    const merged = { ...llmSlots };

    // phone → regex wins: if regex has a value, it overrides LLM
    for (const field of REGEX_WINS_FIELDS) {
        if (regexSlots[field] !== null) {
            (merged as any)[field] = regexSlots[field];
        }
        // else: LLM value stands (may also be null)
    }

    // other fields → LLM wins: only use regex when LLM is null
    for (const field of LLM_WINS_FIELDS) {
        if (merged[field] === null && regexSlots[field] !== null) {
            (merged as any)[field] = regexSlots[field];
        }
        // else: LLM value stands (including when both are non-null)
    }

    return merged;
}

// ─── Build source map for ExtractionMeta ─────────────────────────────────────
// Determines whether each non-null field in the merged result came from LLM or regex.
// Skips 'name' — LLM never extracts name.
export function buildSourceMap(
    mergedSlots: ExtractedSlots,
    llmSlots: ExtractedSlots
): ExtractionMeta['sources'] {
    const sources: ExtractionMeta['sources'] = {};

    const allTrackedFields = [...REGEX_WINS_FIELDS, ...LLM_WINS_FIELDS] as const;

    for (const field of allTrackedFields) {
        if (mergedSlots[field] !== null) {
            sources[field] = mergedSlots[field] === llmSlots[field] ? 'llm' : 'regex';
        }
    }

    return sources;
}

// ─── Merge LLM slots with regex fallback ─────────────────────────────────────
// Fills null LLM fields with regex results (belt-and-suspenders)
export function mergeSlots(llmSlots: ExtractedSlots, regexSlots: ExtractedSlots): ExtractedSlots {
    const merged = { ...llmSlots };
    for (const key of Object.keys(regexSlots) as (keyof ExtractedSlots)[]) {
        if (merged[key] === null && regexSlots[key] !== null) {
            (merged as any)[key] = regexSlots[key];
        }
    }
    return merged;
}
