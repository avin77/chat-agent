/**
 * Universal PII (Personally Identifiable Information) Redaction Utility
 * Provides regex-based masking for sensitive data in text.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Matches most phone formats: +1 123 456 7890, 123-456-7890, (123) 456-7890, 1234567890
// Focusing on common mobile/landline patterns
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Specific patterns for common intro phrases in chat
const NAME_PATTERNS = [
  /my name is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi,
  /i am ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi,
  /this is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi,
];

/**
 * Redacts PII from a string.
 * @param text The text to scrub.
 * @param replacement The string to replace PII with.
 * @returns Scrubbed text.
 */
export function redactPII(text: string, replacement: string = "[REDACTED]"): string {
  if (!text) return text;

  let scrubbed = text;

  // Mask Emails
  scrubbed = scrubbed.replace(EMAIL_REGEX, replacement);

  // Mask Phones
  scrubbed = scrubbed.replace(PHONE_REGEX, replacement);

  // Mask Names based on patterns
  for (const pattern of NAME_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, (match, p1) => {
      // Keep the intro phrase, redact the captured name
      return match.replace(p1, replacement);
    });
  }

  return scrubbed;
}

/**
 * Redacts PII from an object recursively.
 * Useful for scrubbing session logs or JSON data.
 */
export function redactObjectPII<T>(obj: T, replacement: string = "[REDACTED]"): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return redactPII(obj, replacement) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObjectPII(item, replacement)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // We might want to skip certain keys if we know they are safe, 
        // but for a universal scrub, we check all values.
        newObj[key] = redactObjectPII((obj as any)[key], replacement);
      }
    }
    return newObj as T;
  }

  return obj;
}
