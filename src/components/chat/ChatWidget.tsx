// src/components/chat/ChatWidget.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect, useState } from 'react';
import { Send, Bot, Loader2 } from 'lucide-react';
import { SuggestionChips } from './SuggestionChips';

function cn(...classes: (string | undefined | false)[]) {
    return classes.filter(Boolean).join(' ');
}

export function ChatWidget() {
    const [sessionId] = useState(() => {
        if (typeof window !== 'undefined') {
            let id = localStorage.getItem('ezy_chat_id');
            if (!id) {
                id = Math.random().toString(36).substring(2) + Date.now().toString(36);
                localStorage.setItem('ezy_chat_id', id);
            }
            return id;
        }
        return '';
    });

    const { messages, sendMessage, status, error } = useChat({
        id: sessionId
    });
    const isLoading = status !== 'ready';
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [rateLimitInfo, setRateLimitInfo] = useState<{ blocked: boolean; waitTime: number; count: number } | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Log rate limit info when error changes
    useEffect(() => {
        if (error) {
            console.error('🚫 Chat Error:', error.message);

            // Regex to find wait time in string: "retry in 55.92s"
            const match = error.message.match(/retry in ([0-9.]+)s/);

            // Try to parse rate limit details from error (JSON or String)
            let waitTime = 0;
            let count = 0;

            if (match) {
                waitTime = Math.ceil(parseFloat(match[1]));
                count = 20; // Assume limit reached
            } else {
                try {
                    const errorData = JSON.parse(error.message);
                    if (errorData.error === 'Rate Limit Exceeded') {
                        waitTime = Math.ceil(errorData.waitMs / 1000);
                        count = errorData.requestCount;
                    }
                } catch (e) { }
            }

            if (waitTime > 0) {
                console.warn(`⏳ Rate Limit: Waiting ${waitTime}s before retry`);
                setRateLimitInfo({ blocked: true, waitTime, count });

                // Auto-retry
                setTimeout(() => {
                    setRateLimitInfo(null);
                    console.log('🔄 Auto-retrying message... (Reload not supported in this version)');
                    // reload(); // Reload not available in current types
                }, waitTime * 1000);
            } else {
                setRateLimitInfo(null);
            }
        } else {
            setRateLimitInfo(null);
        }
    }, [error]);

    if (!mounted) return null;

    const handleChipSelect = (text: string) => {
        setInput(text);
    };

    const handleFormSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;

        // Validation: Phone Number
        // Prevent sending invalid phone numbers (5-9 digits) when context implies phone entry
        const lastBotMsg = (messages.filter((m: any) => m.role !== 'user').pop() as any)?.content?.toLowerCase() || '';
        const isAskingForPhone = /phone|number|mobile|contact/.test(lastBotMsg);

        const hasShortNumber = /\d{5,9}/.test(input);
        const hasValidNumber = /\b\d{10}\b/.test(input);
        const explicitPhoneMention = /phone|number|mobile|call/i.test(input);

        if (hasShortNumber && !hasValidNumber) {
            if (explicitPhoneMention || isAskingForPhone) {
                alert("Please enter a valid 10-digit mobile number.");
                return;
            }
        }

        const currentInput = input;
        setInput('');

        console.log('📤 Sending message to Gemini API...');

        await sendMessage({
            role: 'user',
            content: currentInput,
        } as any);
    };

    return (
        <div className="flex flex-col h-[600px] w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden font-sans mx-auto mt-10">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between">
                <div>
                    <h2 className="font-bold text-lg">EzyBot Assistant</h2>
                    <p className="text-xs text-blue-100 opacity-90">Official Support • EzyHelpers.com</p>
                </div>
                {/* Official Logo */}
                <img
                    src="https://www.ezyhelpers.com/ezyhelper_logo_new.png"
                    alt="EzyHelpers Logo"
                    className="w-10 h-10 object-contain bg-white rounded-full p-1"
                />
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.length === 0 && (
                    <div className="text-center mt-10">
                        <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
                            <img
                                src="https://www.ezyhelpers.com/ezyhelper_logo_new.png"
                                alt="EzyHelpers Logo"
                                className="w-14 h-14 object-contain"
                            />
                        </div>
                        <p className="text-gray-600 font-medium">Hello! How can I assist you today?</p>
                        <SuggestionChips onSelect={handleChipSelect} />
                    </div>
                )}

                {messages.map((m: any) => (
                    <div
                        key={m.id}
                        className={cn(
                            "flex w-full mb-4",
                            m.role === 'user' ? "justify-end" : "justify-start"
                        )}
                    >
                        <div
                            className={cn(
                                "flex max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                                m.role === 'user'
                                    ? "bg-blue-600 text-white rounded-br-none"
                                    : "bg-white text-gray-800 border border-gray-100 rounded-bl-none"
                            )}
                        >
                            {m.content ? m.content : (m.parts ? m.parts.map((p: any) => p.type === 'text' ? p.text : '').join('') : '')}
                        </div>
                    </div>
                ))}

                {(isLoading || rateLimitInfo) && (
                    <div className="flex justify-start w-full">
                        <div className={`flex items-center space-x-2 bg-white px-4 py-2 rounded-2xl rounded-bl-none border border-gray-100 shadow-sm ${rateLimitInfo ? 'animate-pulse bg-blue-50' : ''}`}>
                            {rateLimitInfo ? (
                                <>
                                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                                    <span className="text-xs text-orange-600 font-medium">Please connect in some time ({rateLimitInfo.waitTime}s)</span>
                                </>
                            ) : (
                                <>
                                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                    <span className="text-xs text-gray-500">EzyBot is thinking...</span>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {error && !rateLimitInfo && (
                    <div className="mx-4 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                        <div className="font-semibold mb-1">⚠️ Error</div>
                        <div>{error.message}</div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleFormSubmit} className="p-4 bg-white border-t border-gray-100">
                <div className="flex items-center space-x-2">
                    <input
                        className="flex-1 border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        value={input}
                        placeholder="Type your message..."
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim() || rateLimitInfo?.blocked}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                        title={rateLimitInfo?.blocked ? `Rate limited. Wait ${rateLimitInfo.waitTime}s` : ''}
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </form>
        </div>
    );
}
