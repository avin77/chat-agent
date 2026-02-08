// Comprehensive Test Cases for Chat Agent
export interface TestCase {
  id: string;
  scenario: string;
  expectedIntent: string;
  messages: string[];
  expectedExtraction: {
    name?: string;
    phone?: string;
    location?: string;
    workType?: string;
    requirements?: string;
  };
  shouldComplete: boolean;
}

export const TEST_CASES: TestCase[] = [
  // ===== HIRE MAID SCENARIOS =====
  {
    id: 'hire_01',
    scenario: 'Customer wants to hire maid - direct',
    expectedIntent: 'hire_maid',
    messages: [
      'I need a maid for cooking',
      'My number is 9876543210',
      'Koramangala',
      'Cooking',
      'Full-time',
    ],
    expectedExtraction: {
      phone: '9876543210',
      location: 'Koramangala',
      workType: 'Cooking',
      requirements: 'Full-time',
    },
    shouldComplete: true,
  },
  {
    id: 'hire_02',
    scenario: 'Customer wants maid - provides all info upfront',
    expectedIntent: 'hire_maid',
    messages: [
      'Looking for full-time cook in HSR Layout. My number is 9123456789',
    ],
    expectedExtraction: {
      phone: '9123456789',
      location: 'HSR',
      workType: 'Cooking',
      requirements: 'Full-time',
    },
    shouldComplete: true,
  },
  {
    id: 'hire_03',
    scenario: 'Customer wants cleaning help',
    expectedIntent: 'hire_maid',
    messages: [
      'Need someone for cleaning',
      '9988776655',
      'Whitefield',
      'Cleaning',
      'Part-time in the morning',
    ],
    expectedExtraction: {
      phone: '9988776655',
      location: 'Whitefield',
      workType: 'Cleaning',
      requirements: 'Part-time',
    },
    shouldComplete: true,
  },
  {
    id: 'hire_04',
    scenario: 'Customer wants babysitter',
    expectedIntent: 'hire_maid',
    messages: [
      'I want to hire a babysitter',
      'Call me at 9876512345',
      'Indiranagar',
      'Babysitting',
      'Full-time',
    ],
    expectedExtraction: {
      phone: '9876512345',
      location: 'Indiranagar',
      workType: 'Babysitting',
      requirements: 'Full-time',
    },
    shouldComplete: true,
  },
  {
    id: 'hire_05',
    scenario: 'Customer wants domestic help - both cooking and cleaning',
    expectedIntent: 'hire_maid',
    messages: [
      'Looking for domestic help for both cooking and cleaning',
      '9112233445',
      'Marathahalli',
      'Both cooking and cleaning',
      'Full-time live-in',
    ],
    expectedExtraction: {
      phone: '9112233445',
      location: 'Marathahalli',
      workType: 'Cooking & Cleaning',
      requirements: 'Full-time',
    },
    shouldComplete: true,
  },

  // ===== HELPER REGISTRATION SCENARIOS =====
  {
    id: 'helper_01',
    scenario: 'Helper looking for work - step by step',
    expectedIntent: 'helper_registration',
    messages: [
      'I am looking for a job as a cook',
      'My name is Lakshmi',
      '9876543211',
      'Cooking',
      'Koramangala and HSR Layout',
    ],
    expectedExtraction: {
      name: 'Lakshmi',
      phone: '9876543211',
      workType: 'Cooking',
      location: 'Koramangala',
    },
    shouldComplete: true,
  },
  {
    id: 'helper_02',
    scenario: 'Helper provides full details upfront',
    expectedIntent: 'helper_registration',
    messages: [
      'I am Priya, looking for work as a cleaner. My number is 9123456788. I can work in Indiranagar.',
    ],
    expectedExtraction: {
      name: 'Priya',
      phone: '9123456788',
      workType: 'Cleaning',
      location: 'Indiranagar',
    },
    shouldComplete: true,
  },
  {
    id: 'helper_03',
    scenario: 'Experienced helper registration',
    expectedIntent: 'helper_registration',
    messages: [
      'I want to register as a maid',
      'Asha',
      '9988112233',
      'Cooking and cleaning both',
      'BTM Layout, JP Nagar',
    ],
    expectedExtraction: {
      name: 'Asha',
      phone: '9988112233',
      workType: 'Cooking & Cleaning',
      location: 'BTM',
    },
    shouldComplete: true,
  },
  {
    id: 'helper_04',
    scenario: 'Helper looking for babysitting work',
    expectedIntent: 'helper_registration',
    messages: [
      'Need job for babysitting',
      'Ravi',
      '9876009988',
      'Babysitting',
      'Whitefield and Marathahalli',
    ],
    expectedExtraction: {
      name: 'Ravi',
      phone: '9876009988',
      workType: 'Babysitting',
      location: 'Whitefield',
    },
    shouldComplete: true,
  },
  {
    id: 'helper_05',
    scenario: 'Helper for elderly care',
    expectedIntent: 'helper_registration',
    messages: [
      'I can take care of elderly people',
      'Meena',
      '9123998877',
      'Elderly care',
      'Jayanagar',
    ],
    expectedExtraction: {
      name: 'Meena',
      phone: '9123998877',
      workType: 'Elderly Care',
      location: 'Jayanagar',
    },
    shouldComplete: true,
  },

  // ===== COMPLAINT SCENARIOS =====
  {
    id: 'complaint_01',
    scenario: 'Customer complaint - maid did not show up',
    expectedIntent: 'complaint',
    messages: [
      'I have a complaint. The maid did not come today',
      '9876543219',
    ],
    expectedExtraction: {
      phone: '9876543219',
    },
    shouldComplete: true,
  },
  {
    id: 'complaint_02',
    scenario: 'Angry customer - bad service',
    expectedIntent: 'complaint',
    messages: [
      'This is terrible service! Very upset!',
      '9123456780',
    ],
    expectedExtraction: {
      phone: '9123456780',
    },
    shouldComplete: true,
  },
  {
    id: 'complaint_03',
    scenario: 'Customer dissatisfied',
    expectedIntent: 'complaint',
    messages: [
      'Not satisfied with the helper you sent',
      'Call me at 9988776654',
    ],
    expectedExtraction: {
      phone: '9988776654',
    },
    shouldComplete: true,
  },
  {
    id: 'complaint_04',
    scenario: 'Urgent complaint with phone',
    expectedIntent: 'complaint',
    messages: [
      'I need to complain about my helper. My number is 9876512340',
    ],
    expectedExtraction: {
      phone: '9876512340',
    },
    shouldComplete: true,
  },
  {
    id: 'complaint_05',
    scenario: 'Problem with service',
    expectedIntent: 'complaint',
    messages: [
      'Having problem with the maid service',
      '9112200334',
    ],
    expectedExtraction: {
      phone: '9112200334',
    },
    shouldComplete: true,
  },

  // ===== GENERAL QUERY SCENARIOS =====
  {
    id: 'general_01',
    scenario: 'User asks about services',
    expectedIntent: 'general',
    messages: [
      'What services do you provide?',
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },
  {
    id: 'general_02',
    scenario: 'User asks about pricing',
    expectedIntent: 'general',
    messages: [
      'How much does it cost?',
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },
  {
    id: 'general_03',
    scenario: 'User asks about locations',
    expectedIntent: 'general',
    messages: [
      'Do you operate in Mumbai?',
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },
  {
    id: 'general_04',
    scenario: 'User greeting',
    expectedIntent: 'general',
    messages: [
      'Hello',
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },
  {
    id: 'general_05',
    scenario: 'User asks about working hours',
    expectedIntent: 'general',
    messages: [
      'What are your working hours?',
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },

  // ===== EDGE CASES =====
  {
    id: 'edge_01',
    scenario: 'Invalid phone number - needs retry',
    expectedIntent: 'hire_maid',
    messages: [
      'Need a maid',
      '12345', // Invalid
      '9876543218', // Valid
      'Koramangala',
      'Cooking',
      'Full-time',
    ],
    expectedExtraction: {
      phone: '9876543218',
      location: 'Koramangala',
      workType: 'Cooking',
    },
    shouldComplete: true,
  },
  {
    id: 'edge_02',
    scenario: 'User provides phone with +91',
    expectedIntent: 'hire_maid',
    messages: [
      'Want to hire cook',
      '+91 9876543217',
      'HSR',
      'Cooking',
      'Part-time',
    ],
    expectedExtraction: {
      phone: '9876543217',
      location: 'HSR',
      workType: 'Cooking',
    },
    shouldComplete: true,
  },
  {
    id: 'edge_03',
    scenario: 'Mixed case and spacing',
    expectedIntent: 'hire_maid',
    messages: [
      'NEED MAID',
      '98 7654 3216',
      'kORAmangaLA',
      'COOKING',
      'full time',
    ],
    expectedExtraction: {
      phone: '9876543216',
      location: 'Koramangala',
      workType: 'Cooking',
    },
    shouldComplete: true,
  },
  {
    id: 'edge_04',
    scenario: 'User says they are NOT looking for maid',
    expectedIntent: 'general',
    messages: [
      "I don't need a maid",
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },
  {
    id: 'edge_05',
    scenario: 'User asks for friend',
    expectedIntent: 'general',
    messages: [
      'My friend needs a maid',
    ],
    expectedExtraction: {},
    shouldComplete: false,
  },

  // ===== COMPLEX SCENARIOS =====
  {
    id: 'complex_01',
    scenario: 'User switches intent mid-conversation',
    expectedIntent: 'hire_maid', // Initial
    messages: [
      'Need a maid',
      'Actually, I have a complaint about my current maid',
      '9876543215',
    ],
    expectedExtraction: {
      phone: '9876543215',
    },
    shouldComplete: true,
  },
  {
    id: 'complex_02',
    scenario: 'User provides all data in first message',
    expectedIntent: 'hire_maid',
    messages: [
      'Hi, I am Ramesh from Koramangala. I need a full-time cook. My number is 9876543214',
    ],
    expectedExtraction: {
      name: 'Ramesh',
      phone: '9876543214',
      location: 'Koramangala',
      workType: 'Cooking',
      requirements: 'Full-time',
    },
    shouldComplete: true,
  },
  {
    id: 'complex_03',
    scenario: 'Helper with experience details',
    expectedIntent: 'helper_registration',
    messages: [
      'I am Sunita with 10 years experience in cooking. Looking for work. 9123456786. Can work in Whitefield.',
    ],
    expectedExtraction: {
      name: 'Sunita',
      phone: '9123456786',
      workType: 'Cooking',
      location: 'Whitefield',
    },
    shouldComplete: true,
  },
];

export function getTestCasesByIntent(intent: string): TestCase[] {
  return TEST_CASES.filter(tc => tc.expectedIntent === intent);
}

export function getTestCaseById(id: string): TestCase | undefined {
  return TEST_CASES.find(tc => tc.id === id);
}

console.log(`✅ Generated ${TEST_CASES.length} test cases`);
console.log(`   - Hire Maid: ${getTestCasesByIntent('hire_maid').length}`);
console.log(`   - Helper Registration: ${getTestCasesByIntent('helper_registration').length}`);
console.log(`   - Complaints: ${getTestCasesByIntent('complaint').length}`);
console.log(`   - General: ${getTestCasesByIntent('general').length}`);
console.log(`   - Edge Cases: ${TEST_CASES.filter(tc => tc.id.startsWith('edge_')).length}`);
console.log(`   - Complex: ${TEST_CASES.filter(tc => tc.id.startsWith('complex_')).length}`);
