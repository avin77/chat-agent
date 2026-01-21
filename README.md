# EzyBot - AI Customer Support for EzyHelpers

An intelligent chatbot system for **www.ezyhelpers.com** that handles customer inquiries, helper registrations, and complaints using Google Gemini AI.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Copy `.env.local.example` to `.env.local` and fill in:
- **GOOGLE_GENERATIVE_AI_API_KEY**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
- **SUPABASE credentials**: Get from [Supabase Dashboard](https://supabase.com)
- **RESEND_API_KEY**: Get from [Resend](https://resend.com) (optional, for angry customer emails)
- **ADMIN_EMAIL**: Your support team email

### 2a. Gmail Configuration (Important)
If you are using Gmail to send emails, you MUST use an **App Password**, not your main password.
1. Enable [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification).
2. Generate an App Password [here](https://myaccount.google.com/apppasswords).
3. Set `GMAIL_PASS` to the 16-character code.

### 3. Create Supabase Tables
Run the SQL script in `walkthrough.md` → Setup Instructions → Step 2

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📖 Full Documentation
See [`walkthrough.md`](file:///c:/Users/shobh/.gemini/antigravity/brain/683a5508-9ce0-4eb8-a26e-f78d33b7e7cc/walkthrough.md) for:
- Complete architecture overview
- Database schema details
- Testing scenarios
- Deployment guide
- Customization instructions

## 🎯 Features
- **Intent Detection**: Automatically routes users (Customer, Helper, Complaint)
- **Smart Questioning**: Dynamic conversation flows based on user type
- **Angry User Escalation**: Auto-emails support team for urgent issues
- **Free Tier**: 1,500 conversations/day on Gemini's free plan
- **Scalable Architecture**: Modular code structure for easy modification

## 🧠 Agentic Capabilities (V3 Roadmap)
- [ ] **Context Awareness**: Remembers details provided earlier in the chat.
- [ ] **Self-Correction**: Validates inputs (Phone/Location) in real-time.
- [ ] **Dynamic Flow**: Skips questions if answers are already detected.
- [ ] **Smart Escalation**: Filters general enquiries from urgent leads.
- [ ] **State Persistence**: (Future) Save session state to DB.

## 🛠️ Tech Stack
- Next.js 14 + TypeScript
- Vercel AI SDK + Google Gemini
- Supabase (PostgreSQL)
- Tailwind CSS
- Resend (Email)

## 📝 License
MIT
