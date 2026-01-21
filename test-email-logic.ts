
import { sendEmail } from './src/lib/email';

// Mock process.env
process.env.GMAIL_USER = ''; // Force mock mode
process.env.GMAIL_PASS = '';

async function test() {
    console.log('--- Test 1: Single Email ---');
    await sendEmail({ to: 'admin@test.com', subject: 'Test 1', html: 'Body 1' });

    console.log('\n--- Test 2: Multiple Emails (Comma) ---');
    await sendEmail({ to: 'admin1@test.com, admin2@test.com,admin3@test.com', subject: 'Test 2', html: 'Body 2' });

    console.log('\n--- Test 3: Multiple Emails (Array) ---');
    await sendEmail({ to: ['adminA@test.com', 'adminB@test.com'], subject: 'Test 3', html: 'Body 3' });
}

test();
