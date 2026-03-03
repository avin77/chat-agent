// Improved Intent Detection with clear patterns
export type Intent = 'maid_hire' | 'maid_registration' | 'complaint' | 'general';

interface IntentResult {
  intent: Intent;
  confidence: number;
  keywords: string[];
}

export function detectIntent(message: string): IntentResult {
  const lower = message.toLowerCase();
  const keywords: string[] = [];

  // Negative patterns - EXCLUDE from specific intents
  const negativePatterns = [
    /don't|do not|doesn't|never|stop/i,
    /my friend|my neighbor|someone else|not me/i,
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(lower)) {
      return { intent: 'general', confidence: 0.9, keywords: ['negative_pattern'] };
    }
  }

  // COMPLAINT - High priority
  const complaintPatterns = [
    { pattern: /complaint|complain/i, weight: 10, keyword: 'complaint' },
    { pattern: /problem with|issue with|having problem|having issue/i, weight: 9, keyword: 'problem' },
    { pattern: /didn't come|not come|didn't show|never came/i, weight: 10, keyword: 'no_show' },
    { pattern: /bad service|poor service|terrible|worst/i, weight: 9, keyword: 'bad_service' },
    { pattern: /angry|upset|frustrated|furious/i, weight: 8, keyword: 'emotion' },
    { pattern: /want refund|money back|refund/i, weight: 10, keyword: 'refund' },
    { pattern: /not satisfied|unhappy|disappointed|dissatisfied/i, weight: 8, keyword: 'dissatisfied' },
    { pattern: /not happy|very bad|horrible experience/i, weight: 7, keyword: 'negative' },
  ];

  let complaintScore = 0;
  for (const { pattern, weight, keyword } of complaintPatterns) {
    if (pattern.test(lower)) {
      complaintScore += weight;
      keywords.push(keyword);
    }
  }

  if (complaintScore >= 8) {
    return { intent: 'complaint', confidence: Math.min(complaintScore / 10, 1), keywords };
  }

  // MAID REGISTRATION - Check before Hire (Specific vs General)
  const maidRegPatterns = [
    { pattern: /i am.*maid|i am.*helper|i am.*cook/i, weight: 10, keyword: 'i_am_helper' },
    { pattern: /need.*job|want.*job|looking for.*job/i, weight: 10, keyword: 'need_job' },
    { pattern: /want.*work|need.*work|looking for.*work/i, weight: 9, keyword: 'want_work' },
    { pattern: /i can.*cook|i can.*clean/i, weight: 8, keyword: 'skills' },
    { pattern: /years.*experience|experience.*years/i, weight: 7, keyword: 'experience' },
    { pattern: /register|registration|sign up/i, weight: 8, keyword: 'register' },
    { pattern: /available for work|ready to work/i, weight: 8, keyword: 'available' },
    { pattern: /register as a maid|register as a helper|register as a cook/i, weight: 10, keyword: 'register_as_maid' },
  ];

  let maidRegScore = 0;
  let regKeywords: string[] = [];
  for (const { pattern, weight, keyword } of maidRegPatterns) {
    if (pattern.test(lower)) {
      maidRegScore += weight;
      regKeywords.push(keyword);
    }
  }

  if (maidRegScore >= 8) {
    return { intent: 'maid_registration', confidence: Math.min(maidRegScore / 10, 1), keywords: regKeywords };
  }

  // MAID HIRE - Customer looking to hire
  const maidHirePatterns = [
    { pattern: /need.*maid|want.*maid|looking for.*maid/i, weight: 10, keyword: 'need_maid' },
    { pattern: /hire.*maid|hire.*help|hire.*cook|hire.*cleaner/i, weight: 10, keyword: 'hire_maid' },
    { pattern: /need.*cook|want.*cook|looking for.*cook/i, weight: 9, keyword: 'need_cook' },
    { pattern: /need.*cleaner|want.*cleaner|looking for.*cleaner/i, weight: 9, keyword: 'need_cleaner' },
    { pattern: /need someone|need.*someone for|looking for someone/i, weight: 8, keyword: 'need_someone' },
    { pattern: /domestic help|house help|home help/i, weight: 8, keyword: 'domestic_help' },
    { pattern: /babysitter|nanny/i, weight: 9, keyword: 'babysitter' },
    { pattern: /full.?time.*cook|part.?time.*cook/i, weight: 7, keyword: 'cook_type' },
    { pattern: /full.?time.*clean|part.?time.*clean/i, weight: 7, keyword: 'clean_type' },
    { pattern: /maid service|cleaning service|cooking service/i, weight: 7, keyword: 'service' },
  ];

  let maidHireScore = 0;
  let hireKeywords: string[] = [];
  for (const { pattern, weight, keyword } of maidHirePatterns) {
    if (pattern.test(lower)) {
      maidHireScore += weight;
      hireKeywords.push(keyword);
    }
  }

  if (maidHireScore >= 8) {
    return { intent: 'maid_hire', confidence: Math.min(maidHireScore / 10, 1), keywords: hireKeywords };
  }

  // Default to GENERAL
  return { intent: 'general', confidence: 0.5, keywords: ['default'] };
}

// Quick test
if (require.main === module) {
  const tests = [
    "I need a maid for cooking",
    "I want to complain about bad service",
    "I am looking for a job as a cook",
    "What services do you offer?",
  ];

  tests.forEach(test => {
    console.log(`"${test}" =>`, detectIntent(test));
  });
}
