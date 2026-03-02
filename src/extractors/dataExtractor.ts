// Structured Data Extraction using regex + validation

export interface ExtractedData {
  name: string | null;
  phone: string | null;
  location: string | null;
  workType: string | null;
  requirements: string | null;
}

// ─── Extended extraction result for state machine ────────────────────────────
export interface ExtractedSlots {
  name: string | null;
  phone: string | null;
  location: string | null;
  service_type: string | null;
  schedule: string | null;
  salary_range: string | null;
  family_size: string | null;
  has_experience: string | null;
}

// ─── Phone ───────────────────────────────────────────────────────────────────
export function extractPhone(text: string): string | null {
  const patterns = [
    // Standard 10-digit Indian mobile (6-9 start), not preceded by another digit
    // Uses (?<!\d) not \b so alpha-prefixed inputs like "ph9876543210" also match
    /(?<!\d)([6-9]\d{9})(?!\d)/g,
    // +91 country code prefix
    /(\+91[\s-]?[6-9]\d{9})(?!\d)/g,
    // 91 country code prefix (no +), must not be preceded by digit to avoid ambiguity
    /(?<!\d)(91[\s-]?[6-9]\d{9})(?!\d)/g,
    // Leading zero: 09876543210 — strip leading 0, get valid 10-digit
    /(?<!\d)(0[6-9]\d{9})(?!\d)/g,
    // Space or hyphen in middle (5+5): 98765 43210 or 98765-43210
    /(?<!\d)([6-9]\d{4}[\s-]\d{5})(?!\d)/g,
    // Space or hyphen in middle (4+3+3 or other splits): 9876 543 210
    /(?<!\d)([6-9]\d{3}[\s-]\d{3}[\s-]\d{3})(?!\d)/g,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      const cleaned = matches[0].replace(/[^\d]/g, '');
      const phone = cleaned.slice(-10);
      if (isValidPhone(phone)) {
        return phone;
      }
    }
  }

  return null;
}

export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

// ─── Name ────────────────────────────────────────────────────────────────────
export function extractName(text: string): string | null {
  const namePatterns = [
    /(?:my name is|i am|this is|call me|i'm|naam)\s+([a-z]{2,30}(?:\s+[a-z]{2,30})?)/i,
    /^([a-z]{3,30})$/i,
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
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
    'skip', 'pass', 'full', 'part', 'time', 'cook', 'clean', 'maid',
    'help', 'baby', 'care', 'elderly', 'not', 'done', 'good',
  ];
  return commonWords.includes(word.toLowerCase());
}

function capitalizeWords(str: string): string {
  return str.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ─── Location ────────────────────────────────────────────────────────────────
const BENGALURU_AREAS = [
  'koramangala', 'indiranagar', 'whitefield', 'marathahalli', 'btm',
  'hsr', 'hsr layout', 'electronic city', 'jp nagar', 'jayanagar',
  'malleshwaram', 'rajajinagar', 'yeshwanthpur', 'hebbal', 'bannerghatta',
  'sarjapur', 'bellandur', 'kormangala', 'mg road', 'mgroad', 'brigade road',
  'yelahanka', 'rt nagar', 'basavanagudi', 'vijayanagar', 'banashankari',
  'sadashivanagar', 'frazer town', 'cox town', 'ulsoor', 'richmond town',
  'wilson garden', 'bommanahalli', 'begur', 'arekere', 'kudlu gate',
  'kengeri', 'nagarbhavi', 'peenya', 'dasarahalli', 'rr nagar',
  'domlur', 'hal', 'old airport road',
  // Common spelling variants / phonetic misspellings
  'indranagar', 'whitfield', 'whitefeild', 'maratahalli', 'jpnagar',
  'koramanagala', 'koramangla', 'koramanagla', 'hsr layot',
];

// ─── Levenshtein distance for fuzzy location matching ────────────────────────
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function extractLocation(text: string): string | null {
  const lower = text.toLowerCase();

  // Layer 1: exact substring match (fast path)
  for (const area of BENGALURU_AREAS) {
    if (lower.includes(area)) {
      return capitalizeWords(area);
    }
  }

  if (lower.includes('bangalore') || lower.includes('bengaluru')) {
    return 'Bangalore';
  }

  // Layer 2: fuzzy match on individual words — tolerates 1 typo per 5 chars
  const words = lower.split(/[\s,]+/);
  for (const word of words) {
    if (word.length < 4) continue; // skip short words (prepositions, articles, etc.)
    for (const area of BENGALURU_AREAS) {
      const firstWord = area.split(' ')[0]; // compare against first word of multi-word area
      if (firstWord.length < 4) continue;
      const threshold = Math.floor(firstWord.length / 5); // 1 edit per 5 chars
      if (threshold > 0 && levenshtein(word, firstWord) <= threshold) {
        return capitalizeWords(area);
      }
    }
  }

  return null;
}

// ─── Work Type / Service Type ────────────────────────────────────────────────
export function extractWorkType(text: string): string | null {
  const lower = text.toLowerCase();

  if (lower.includes('cook') || lower.includes('cooking') || lower.includes('khana')) return 'Cooking';
  if (lower.includes('clean') || lower.includes('cleaning') || lower.includes('safai')) return 'Cleaning';
  if (lower.includes('babysit') || lower.includes('baby') || lower.includes('child') || lower.includes('nanny') || lower.includes('baccha')) return 'Baby Care';
  if (lower.includes('elderly') || lower.includes('old') || lower.includes('senior') || lower.includes('caretaker')) return 'Elderly Care';
  if (lower.includes('both') || (lower.includes('cook') && lower.includes('clean'))) return 'Cooking & Cleaning';
  if (/\ball\s+work\b|\ball\s+type|\ball\s+kind/.test(lower)) return 'Cleaning';

  return null;
}

// ─── Schedule (NEW) ──────────────────────────────────────────────────────────
export function extractSchedule(text: string): string | null {
  const lower = text.toLowerCase();

  // 24-hour live-in maid (stays at home)
  if (/24\s*(?:hr|hour|hours|hrs)|live[\s-]?in|stay[\s-]?in|full[\s-]?time|fulltime|24\/7|pura\s*din/i.test(lower)) return '24-hour Live-in';
  // 12-hour day maid (morning to evening)
  if (/12\s*(?:hr|hour|hours|hrs)|part[\s-]?time|parttime|half[\s-]?day|day[\s-]?maid|morning|evening|few\s*hours/i.test(lower)) return '12-hour Day';

  return null;
}

// ─── Salary Range (NEW) ──────────────────────────────────────────────────────
export function extractSalaryRange(text: string): string | null {
  const lower = text.toLowerCase();

  // Skip patterns
  if (/^(skip|no|na|n\/a|don'?t know|not sure|no preference|team will discuss|you decide)$/i.test(text.trim())) {
    return 'Team will discuss';
  }

  // Don't match phone numbers (10-digit numbers starting with 6-9)
  const trimmed = text.replace(/[^\d]/g, '');
  if (/^[6-9]\d{9}$/.test(trimmed)) return null;

  // Match salary patterns: "10k", "10000", "10,000", "Rs 10000", "15-20k"
  const salaryPatterns = [
    /(\d+)\s*-\s*(\d+)\s*k/i,
    /(\d+)\s*k\s*(?:to|[-–])\s*(\d+)\s*k/i,
    /(?:rs\.?|₹|inr)\s*(\d[\d,]*)/i,  // Currency prefix
    /(\d+)\s*k/i,
    /(\d+)\s*(?:thousand|hazar)/i,
    /\b(\d{4,6})\b/,  // Plain number 4-6 digits (e.g. "20000", "8000", "15000")
  ];

  for (const pattern of salaryPatterns) {
    if (pattern.test(lower)) {
      return text.trim();
    }
  }

  // Accept freeform salary text
  if (lower.includes('salary') || lower.includes('budget') || lower.includes('pay') || lower.includes('range')) {
    return text.trim();
  }

  return null;
}

// ─── Family Size (NEW) ──────────────────────────────────────────────────────
export function extractFamilySize(text: string): string | null {
  const lower = text.toLowerCase();

  // Don't extract family size from salary-like strings (e.g., "15-20k", "Rs 20000")
  // Also block experience answers (e.g., "Yes, 2 years ago", "2 months experience")
  if (/\d+\s*k|\d+\s*-\s*\d+\s*k|₹|rs\.?|salary|budget|pay|per\s*month|thousand|hazar|lakh|year|ago|experience|exp\b|months?\s*ago/i.test(lower)) {
    return null;
  }

  // Match numbers
  const numMatch = text.match(/\b(\d{1,2})\b/);
  if (numMatch) {
    return numMatch[1];
  }

  // Match word numbers
  const wordNums: Record<string, string> = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'ek': '1', 'do': '2', 'teen': '3', 'chaar': '4', 'paanch': '5',
  };

  for (const [word, num] of Object.entries(wordNums)) {
    if (lower.includes(word)) {
      return num;
    }
  }

  // Match "couple", "few" etc
  if (lower.includes('couple') || lower.includes('just me')) return '2';
  if (lower.includes('alone') || lower.includes('single')) return '1';

  return null;
}

// ─── Experience (NEW) ───────────────────────────────────────────────────────
export function extractExperience(text: string): string | null {
  const lower = text.toLowerCase();

  if (/\b(yes|yeah|yep|haan|ha|yea)\b/i.test(lower)) return 'Yes';
  if (/\b(no|nope|nahi|never|first time)\b/i.test(lower)) return 'No';
  if (/\d+\s*(?:year|yr|month|time)/i.test(lower)) return text.trim();

  return null;
}

// ─── Requirements (existing, kept for backward compat) ──────────────────────
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

// ─── FAQ Detection (NEW) ────────────────────────────────────────────────────
const FAQ_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /(?:do you|have you|is there|are there).*(?:24\s*(?:hr|hour)|full[\s-]?time|live[\s-]?in)/i, topic: 'Do you have 24hr/full-time/live-in maids?' },
  { pattern: /(?:how much|price|cost|charge|rate|salary|kitna|paisa|budget)/i, topic: 'What are the prices/costs?' },
  { pattern: /(?:what|which).*(?:service|offer|provide)/i, topic: 'What services do you offer?' },
  { pattern: /(?:how|kaise).*(?:work|book|process|kaam)/i, topic: 'How does the process work?' },
  { pattern: /(?:background|verify|verified|police|check|trust)/i, topic: 'Are helpers background verified?' },
  { pattern: /(?:safe|secure|trustworthy|reliable)/i, topic: 'Are your services safe and reliable?' },
  { pattern: /(?:cancel|refund|money back)/i, topic: 'Can I cancel or get a refund?' },
  { pattern: /(?:replace|replacement|change|switch)/i, topic: 'Can I get a replacement?' },
  { pattern: /(?:how long|kab tak|when|time.*take|kitna din)/i, topic: 'How long does it take to find a helper?' },
  { pattern: /(?:trial|try|test|demo)/i, topic: 'Is there a trial period?' },
];

export function detectFAQ(text: string): string | null {
  const lower = text.toLowerCase();

  // Only detect FAQ if the message looks like a question
  const isQuestion = /\?/.test(text) ||
    /^(do |can |is |are |what |how |will |would |could |should |where |when |why |which |have |does )/i.test(lower.trim()) ||
    /\b(kya|kaise|kitna|kab)\b/i.test(lower);

  if (!isQuestion) return null;

  for (const { pattern, topic } of FAQ_PATTERNS) {
    if (pattern.test(lower)) {
      return topic;
    }
  }

  return null;
}

// ─── Wrong City Detection (NEW) ──────────────────────────────────────────────
const NON_BENGALURU_CITIES = [
  'mumbai', 'delhi', 'chennai', 'hyderabad', 'pune', 'kolkata', 'ahmedabad',
  'jaipur', 'lucknow', 'noida', 'gurgaon', 'gurugram', 'chandigarh',
  'kochi', 'thiruvananthapuram', 'bhopal', 'indore', 'nagpur', 'patna',
  'surat', 'vadodara', 'coimbatore', 'mysore', 'mangalore', 'vizag',
  'visakhapatnam', 'goa', 'ranchi', 'dehradun', 'shimla', 'agra',
];

export function detectWrongCity(text: string): string | null {
  const lower = text.toLowerCase();

  for (const city of NON_BENGALURU_CITIES) {
    // Match city name as a word boundary to avoid false positives
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(lower)) {
      return capitalizeWords(city);
    }
  }

  return null;
}

// ─── Gibberish Detection (NEW) ──────────────────────────────────────────────
export function detectGibberish(text: string): boolean {
  const trimmed = text.trim();

  // Empty or whitespace only
  if (trimmed.length === 0) return true;

  // Pure numbers are always valid (family size, counts, etc.)
  if (/^\d+$/.test(trimmed)) return false;

  // Very short with no vowels (likely random chars)
  if (trimmed.length <= 2 && !/[aeiouAEIOU]/.test(trimmed)) return true;

  // All same character repeated
  if (/^(.)\1{3,}$/.test(trimmed)) return true;

  // Random character sequences (no vowels, long enough to be suspicious)
  if (trimmed.length >= 5) {
    const letters = trimmed.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 5) {
      const vowelCount = (letters.match(/[aeiouAEIOU]/g) || []).length;
      const vowelRatio = vowelCount / letters.length;
      if (vowelRatio < 0.15) return true;
    }
  }

  // Only special characters
  if (/^[^a-zA-Z0-9\u0900-\u097F]+$/.test(trimmed)) return true;

  return false;
}

// ─── Backtrack Detection (NEW) ───────────────────────────────────────────────
export function detectBacktrack(text: string): string | null {
  const lower = text.toLowerCase();

  const backtrackPatterns: Array<{ pattern: RegExp; slot: string }> = [
    { pattern: /(?:change|update|correct|fix|wrong).*(?:phone|number|mobile)/i, slot: 'phone' },
    { pattern: /(?:change|update|correct|fix|wrong).*(?:area|location|place|locality)/i, slot: 'location' },
    { pattern: /(?:change|update|correct|fix|wrong).*(?:service|work|type|help)/i, slot: 'service_type' },
    { pattern: /(?:change|update|correct|fix|wrong).*(?:schedule|time|full|part)/i, slot: 'schedule' },
    { pattern: /(?:change|update|correct|fix|wrong).*(?:salary|pay|budget)/i, slot: 'salary_range' },
    { pattern: /(?:wait|actually|sorry|no no|i meant|galti)/i, slot: '_generic' },
  ];

  for (const { pattern, slot } of backtrackPatterns) {
    if (pattern.test(lower)) {
      if (slot === '_generic') {
        // Try to figure out which slot they want to change
        if (/area|location|place/i.test(lower)) return 'location';
        if (/service|cook|clean|baby|elderly/i.test(lower)) return 'service_type';
        if (/phone|number|mobile/i.test(lower)) return 'phone';
        if (/schedule|time|full|part/i.test(lower)) return 'schedule';
        return null; // Can't determine which slot
      }
      return slot;
    }
  }

  return null;
}

// ─── Extract ALL slots from a single message (for state machine) ─────────────
export function extractAllSlots(text: string): ExtractedSlots {
  return {
    name: extractName(text),
    phone: extractPhone(text),
    location: extractLocation(text),
    service_type: extractWorkType(text),
    schedule: extractSchedule(text),
    salary_range: extractSalaryRange(text),
    family_size: extractFamilySize(text),
    has_experience: extractExperience(text),
  };
}

// ─── Legacy: Extract all data (backward compat) ─────────────────────────────
export function extractAllData(text: string): ExtractedData {
  return {
    name: extractName(text),
    phone: extractPhone(text),
    location: extractLocation(text),
    workType: extractWorkType(text),
    requirements: extractRequirements(text),
  };
}
