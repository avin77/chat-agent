
import * as fs from 'fs';
import * as path from 'path';

// 1. Load Env FIRST
try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf-8');
        const lines = envFile.split('\n');
        for (const line of lines) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                process.env[key] = value;
            }
        }
        console.log('✅ Loaded .env.local');
    }
} catch (e) {
    console.error('Error loading .env.local', e);
}

// 2. Force Disable Resend for this test to verify Gmail
delete process.env.RESEND_API_KEY;
console.log('🚫 Disabled Resend (Forcing Gmail Failover)');

// 3. Dynamic Import to ensure env is ready
async function run() {
    console.log('🔄 Importing email module...');
    const emailModule = await import('./src/lib/email');

    console.log('📧 Sending Test Email via Gmail...');
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
        console.error('❌ GMAIL_USER or GMAIL_PASS not set.');
        return;
    }
    console.log(`From: ${process.env.GMAIL_USER}`);

    const result = await emailModule.sendEmail({
        to: process.env.ADMIN_EMAIL || process.env.GMAIL_USER,
        subject: '[Test] EzyBot Gmail Integration',
        html: '<p>This confirms Nodemailer is working correctly.</p>'
    });

    console.log('\n--- RESULT ---');
    console.log(JSON.stringify(result, null, 2));
}

run();
