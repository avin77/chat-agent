
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function EmbedPage() {
    return (
        <div className="h-screen w-screen bg-transparent flex items-end justify-end p-4 md:p-6">
            <div className="w-full h-full max-w-md mx-auto">
                <ChatWidget />
            </div>
        </div>
    );
}
