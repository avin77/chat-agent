// src/app/chat/page.tsx
'use client';

import { ChatWidget } from '@/components/chat/ChatWidget';

export default function ChatPage() {
    return (
        <div className="h-screen w-full flex items-center justify-center bg-white overflow-hidden">
            <div className="w-full h-full max-w-full rounded-none shadow-none">
                <ChatWidget />
            </div>
        </div>
    );
}
