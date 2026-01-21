// src/app/chat/page.tsx
'use client';

import { ChatWidget } from '@/components/chat/ChatWidget';

export default function ChatPage() {
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
            <ChatWidget />
        </div>
    );
}
