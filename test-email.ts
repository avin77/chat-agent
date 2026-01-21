
import { sendEmail } from './src/lib/email';
import * as fs from 'fs';

// Manually load env
try {
    const envFile = fs.readFileSync('.env.local', 'utf-8');
    const lines = envFile.split('\n');
    for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            process.env[key] = value;
        }
    }
    if (process.env.RESEND_API_KEY) {
        const key = process.env.RESEND_API_KEY;
        console.log(`✅ Loaded RESEND_API_KEY from .env.local`);
        console.log(`Key Length: ${key.length}`);
        console.log(`Key Start: ${key.substring(0, 5)}...`);
        console.log(`Key End: ...${key.substring(key.length - 5)}`);
    } else {
        console.log('⚠️ RESEND_API_KEY not found in .env.local');
    }
} catch (e) {
    console.error('Error loading .env.local:', e);
}

async function test() {
    console.log('Testing sendEmail...');
    // Use a real email if valid, otherwise mock is fine for logic check
    // If user wants to confirm it works, they likely provided a real key.
    const result = await sendEmail({
        to: 'onboarding@resend.dev', // Default allowed for testing, or user's email
        subject: 'Test Email from EzyBot',
        html: '<p>This is a test email sent via EzyBot script.</p>'
    });
    console.log('Result:', result);
}

test();
