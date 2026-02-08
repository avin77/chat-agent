// Structured Data Extraction using regex + validation
export interface ExtractedData {
  name: string | null;
  phone: string | null;
  location: string | null;
  workType: string | null;
  requirements: string | null;
}

export function extractPhone(text: string): string | null {
  // Match 10-digit Indian phone numbers
  const patterns = [
    /\b([6-9]\d{9})\b/g,  // 10 digits starting with 6-9
    /\b(\+91[\s-]?[6-9]\d{9})\b/g,  // With +91
    /\b(91[\s-]?[6-9]\d{9})\b/g,  // With 91
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      // Clean and return first match
      const cleaned = matches[0].replace(/[^\d]/g, '');
      const phone = cleaned.slice(-10); // Last 10 digits
      if (isValidPhone(phone)) {
        return phone;
      }
    }
  }

  return null;
}

export function isValidPhone(phone: string): boolean {
  // Must be exactly 10 digits and start with 6-9
  return /^[6-9]\d{9}$/.test(phone);
}

export function extractName(text: string): string | null {
  const lower = text.toLowerCase();

  // Pattern: "my name is X", "i am X", "this is X", "call me X"
  const namePatterns = [
    /(?:my name is|i am|this is|call me|i'm)\s+([a-z]{2,30}(?:\s+[a-z]{2,30})?)/i,
    /^([a-z]{3,30})$/i,  // Single word that could be a name (3+ chars)
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Validate: not a common word, reasonable length
      if (name.length >= 2 && name.length <= 50 && !isCommonWord(name)) {
        return capitalizeWords(name);
      }
    }
  }

  return null;
}

function isCommonWord(word: string): boolean {
  const commonWords = [
    'yes', 'no', 'ok', 'okay', 'sure', 'hello', 'hi', 'thanks', 'thank',
    'please', 'need', 'want', 'like', 'have', 'make', 'work', 'job',
  ];
  return commonWords.includes(word.toLowerCase());
}

function capitalizeWords(str: string): string {
  return str.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function extractLocation(text: string): string | null {
  const lower = text.toLowerCase();

  // Bangalore areas
  const areas = [
    'koramangala', 'indiranagar', 'whitefield', 'marathahalli', 'btm',
    'hsr', 'electronic city', 'jp nagar', 'jayanagar', 'malleshwaram',
    'rajajinagar', 'yeshwanthpur', 'hebbal', 'bannerghatta', 'sarjapur',
    'bellandur', 'kormangala', 'mgroad', 'mg road', 'brigade road',
  ];

  for (const area of areas) {
    if (lower.includes(area)) {
      return capitalizeWords(area);
    }
  }

  // Generic "bangalore" mentions
  if (lower.includes('bangalore') || lower.includes('bengaluru')) {
    return 'Bangalore';
  }

  return null;
}

export function extractWorkType(text: string): string | null {
  const lower = text.toLowerCase();

  if (lower.includes('cook') || lower.includes('cooking')) return 'Cooking';
  if (lower.includes('clean') || lower.includes('cleaning')) return 'Cleaning';
  if (lower.includes('babysit') || lower.includes('baby') || lower.includes('child')) return 'Babysitting';
  if (lower.includes('elderly') || lower.includes('old') || lower.includes('senior')) return 'Elderly Care';
  if (lower.includes('both') || (lower.includes('cook') && lower.includes('clean'))) return 'Cooking & Cleaning';

  return null;
}

export function extractRequirements(text: string): string | null {
  const lower = text.toLowerCase();
  const requirements: string[] = [];

  if (lower.includes('full time') || lower.includes('fulltime')) requirements.push('Full-time');
  else if (lower.includes('part time') || lower.includes('parttime')) requirements.push('Part-time');

  if (lower.includes('live in') || lower.includes('stay in')) requirements.push('Live-in');

  if (lower.includes('morning') || lower.includes('evening')) {
    if (lower.includes('morning')) requirements.push('Morning shift');
    if (lower.includes('evening')) requirements.push('Evening shift');
  }

  return requirements.length > 0 ? requirements.join(', ') : null;
}

export function extractAllData(text: string): ExtractedData {
  return {
    name: extractName(text),
    phone: extractPhone(text),
    location: extractLocation(text),
    workType: extractWorkType(text),
    requirements: extractRequirements(text),
  };
}

// Test
if (require.main === module) {
  const tests = [
    "My name is Priya and my number is 9876543210",
    "I live in Koramangala, looking for full-time cook",
    "Call me at 9123456780",
  ];

  tests.forEach(test => {
    console.log(`"${test}"`, extractAllData(test));
  });
}
