export type CanonicalServiceType =
  | 'Cooking'
  | 'Cleaning'
  | 'Baby Care'
  | 'Elderly Care'
  | 'Cooking & Cleaning';

type ServiceVocabularyEntry = {
  canonical: CanonicalServiceType;
  aliases: string[];
};

const SERVICE_ENTRIES: ServiceVocabularyEntry[] = [
  {
    canonical: 'Cooking & Cleaning',
    aliases: [
      'cook and clean',
      'cooking and cleaning',
      'both',
      'all work',
      'khana aur safai',
      'cooking cleaning',
    ],
  },
  {
    canonical: 'Cooking',
    aliases: ['cook', 'cooking', 'khana', 'meal', 'food', 'chef'],
  },
  {
    canonical: 'Cleaning',
    aliases: [
      'clean',
      'cleaning',
      'safai',
      'jhadoo',
      'jhadu',
      'pocha',
      'bartan',
      'utensils',
      'housekeeping',
      'sweeping',
      'mopping',
    ],
  },
  {
    canonical: 'Baby Care',
    aliases: ['baby', 'babysit', 'babysitter', 'child', 'children', 'nanny', 'baccha'],
  },
  {
    canonical: 'Elderly Care',
    aliases: ['elderly', 'senior', 'old', 'parents', 'caretaker', 'patient care'],
  },
];

export const SERVICE_VOCABULARY = {
  entries: SERVICE_ENTRIES,
  promptHint:
    'Accept natural English and Hinglish service phrases such as khana/cook, bartan-jhadoo-safai/cleaning, baccha/baby care, and caretaker/elderly care.',
  recoveryExamples: [
    'bartan aur jhadoo -> Cleaning',
    'khana banana -> Cooking',
    'baccha dekhna -> Baby Care',
    'elder care / caretaker -> Elderly Care',
  ],
} as const;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s&/-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAlias(text: string, alias: string): boolean {
  if (alias.includes(' ')) {
    return text.includes(alias);
  }
  return new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

export function normalizeServicePhrase(text: string): CanonicalServiceType | null {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  const hasCooking =
    hasAlias(normalized, 'cook') ||
    hasAlias(normalized, 'cooking') ||
    hasAlias(normalized, 'khana');
  const hasCleaning =
    hasAlias(normalized, 'clean') ||
    hasAlias(normalized, 'cleaning') ||
    hasAlias(normalized, 'safai') ||
    hasAlias(normalized, 'jhadoo') ||
    hasAlias(normalized, 'bartan') ||
    hasAlias(normalized, 'pocha');

  if (hasAlias(normalized, 'both') || (hasCooking && hasCleaning)) {
    return 'Cooking & Cleaning';
  }

  for (const entry of SERVICE_ENTRIES) {
    if (entry.canonical === 'Cooking & Cleaning') {
      continue;
    }
    if (entry.aliases.some((alias) => hasAlias(normalized, alias))) {
      return entry.canonical;
    }
  }

  return null;
}

export function getServiceVocabularyPromptHint(): string {
  return SERVICE_VOCABULARY.promptHint;
}
