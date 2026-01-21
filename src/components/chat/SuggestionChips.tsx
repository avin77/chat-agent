
// src/components/chat/SuggestionChips.tsx
'use client';

interface SuggestionChipsProps {
    onSelect: (text: string) => void;
}

const SUGGESTIONS = [
    { label: "👋 I'm a New Customer", text: "Hi, I am a new customer looking for a maid." },
    { label: "🧹 I want to work as Helper", text: "Hi, I want to register as a helper." },
    { label: "😤 I have a Complaint", text: "I have a complaint to report." },
    { label: "❓ General Enquiry", text: "I have a general question." },
];

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
    return (
        <div className="flex flex-wrap gap-2 mt-4">
            {SUGGESTIONS.map((s) => (
                <button
                    key={s.label}
                    onClick={() => onSelect(s.text)}
                    className="bg-gray-100 hover:bg-blue-100 text-blue-800 text-sm font-medium px-4 py-2 rounded-full transition-colors border border-gray-200"
                >
                    {s.label}
                </button>
            ))}
        </div>
    );
}
