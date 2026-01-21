
// src/components/chat/SuggestionChips.tsx
'use client';

interface SuggestionChipsProps {
    onSelect: (text: string) => void;
}

const SUGGESTIONS = [
    { label: "🏠 I want to hire a maid", text: "Hi, I want to hire a maid." },
    { label: "⚠️ I have a complaint", text: "I have a complaint to report." },
    { label: "💼 I'm looking for a job", text: "Hi, I want to register as a helper." },
    { label: "💰 What are your charges?", text: "What are your charges for maid services?" },
    { label: "📍 Which areas do you serve?", text: "Which areas do you serve?" },
    { label: "📞 How can I contact you?", text: "How can I contact your team?" },
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
