import nodemailer from 'nodemailer';

export interface EmailPayload {
    to: string | string[];
    subject: string;
    html: string;
}

export async function sendEmail(payload: EmailPayload) {
    // Normalize 'to' field: split string by comma, trim whitespace, remove empty
    const recipients = Array.isArray(payload.to)
        ? payload.to
        : payload.to.split(',').map(e => e.trim()).filter(Boolean);

    // 1. Try Nodemailer (Gmail) if Creds exist
    if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_PASS,
                },
            });

            const info = await transporter.sendMail({
                from: `"EzyBot Support" <${process.env.GMAIL_USER}>`,
                to: recipients, // Nodemailer accepts string[]
                subject: payload.subject,
                html: payload.html,
            });
            console.log('📧 [GMAIL] Email sent:', info.messageId);
            return { success: true, id: info.messageId };
        } catch (error) {
            console.error('📧 [GMAIL] Failed:', error);
            // Don't swallow error, let it propagate or mock? 
            // Better to return error so we know it failed
            return { success: false, error };
        }
    }

    // 2. Fallback: Mock Mode
    console.log('📧 [MOCK EMAIL] To:', recipients.join(', '));
    console.log('Subject:', payload.subject);
    console.log('Body:', payload.html);
    return { success: true, id: 'mock-id' };
}

