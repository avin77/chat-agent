
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        {/* Left Side: Branding / Marketing */}
        <div className="hidden lg:block space-y-6">
          <h1 className="text-5xl font-extrabold text-blue-900 tracking-tight">
            EzyHelpers <span className="text-blue-600">Support</span>
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed">
            Finding a maid or resolving an issue has never been easier.
            Chat with our intelligent **EzyBot** to get started immediately.
          </p>
          <div className="flex gap-4">
            <div className="px-6 py-4 bg-white rounded-xl shadow-sm border border-gray-100">
              <span className="block text-2xl font-bold text-blue-600">24/7</span>
              <span className="text-sm text-gray-500">Always Available</span>
            </div>
            <div className="px-6 py-4 bg-white rounded-xl shadow-sm border border-gray-100">
              <span className="block text-2xl font-bold text-green-600">Instant</span>
              <span className="text-sm text-gray-500">Complaint Resolution</span>
            </div>
          </div>
        </div>

        {/* Right Side: Logged In / Chat Interface */}
        <div className="flex justify-center w-full">
          <ChatWidget />
        </div>
      </div>
    </main>
  );
}
