// src/lib/guardrails.ts
// CRITICAL: Post-LLM response filtering

export function applyStrictGuardrails(text: string): string {
    let cleaned = text;

    // 1. PRICE BLOCKING (HIGHEST PRIORITY)
    const pricePatterns = [
        /₹\s*\d+/gi,
        /Rs\.?\s*\d+/gi,
        /\d+\s*rupees/gi,
        /\d+\s*per\s*(month|day|hour)/gi,
        /salary.*?(\d{3,})/gi,
        /\d+k\s*per/gi,
        // Extended patterns
        /(?:five|ten|fifteen|twenty|thirty|fifty)\s*thousand/gi,
        /\d+k(?!\w)/gi,
        /\d+\s*lakh/gi,
        /(?:one|two|three|four|five)\s*lakh/gi,
    ];

    for (const pattern of pricePatterns) {
        if (pattern.test(cleaned)) {
            console.error('[GUARDRAIL] Price blocked:', cleaned.match(pattern));
            cleaned = cleaned.replace(pattern, '**[Our team will contact you with pricing details]**');
        }
    }

    // 2. LOCATION HANDLING
    if (/(?:work|serve|available|operate).*?(mumbai|delhi|pune|hyderabad|chennai|kolkata)/gi.test(cleaned)) {
        cleaned += '\n\nNote: We primarily operate in Bengaluru. Our team will confirm service availability in your area.';
    }

    // 3. PREVENT PHONE LEAKS
    const phonePattern = /(?<!\w)\d{10}(?!\w)/g;
    const matches = cleaned.match(phonePattern);
    if (matches) {
        console.warn('[GUARDRAIL] Phone detected:', matches);
    }

    // 4. FALLBACK FOR UNKNOWN
    if (/i don't know|i'm not sure|i cannot answer/gi.test(cleaned)) {
        cleaned = "I don't have that specific information right now. Our customer support team will contact you with the details. Could you share your requirements so we can help you better?";
    }

    // 5. EXTERNAL LINKS
    cleaned = cleaned.replace(
        /https?:\/\/(?!ezyhelpers\.com)[^\s]+/gi,
        '[Link removed for security]'
    );

    return cleaned;
}

// Indian phone validation (6-9 start, 10 digits)
export function validatePhone(text: string): string | null {
    const match = text.match(/\b([6-9]\d{9})\b/);
    return match ? match[1] : null;
}

export function extractName(text: string): string | null {
    const patterns = [
        /(?:name is|i am|i'm|this is|name:?)\s+([a-zA-Z]{2,}(?:\s+[a-zA-Z]+)?)/i,
        /([a-zA-Z]{2,}(?:\s+[a-zA-Z]+)?)\s+\d{10}/,
        // Fallback for just a name (2+ letters) if it's the only text (risky but needed for "JH")
        /^([a-zA-Z]{2,}(?:\s+[a-zA-Z]+)?)$/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].trim();
    }
    return null;
}
