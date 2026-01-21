
'use client';

import { useEffect, useState } from 'react';
import { getLLMLogs } from './actions';

export default function DebugDashboard() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterId, setFilterId] = useState('');

    const fetchLogs = async (id?: string) => {
        setLoading(true);
        const data = await getLLMLogs(id || filterId);
        setLogs(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    return (
        <div className="p-6 bg-gray-50 min-h-screen font-mono text-sm">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">🕵️ EzyBot Debug Dashboard</h1>
                <div className="flex space-x-2">
                    <input
                        placeholder="Filter Chat ID..."
                        className="border p-2 rounded text-sm w-48"
                        value={filterId}
                        onChange={(e) => setFilterId(e.target.value)}
                    />
                    <button
                        onClick={() => fetchLogs()}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                    >
                        🔄 Refresh
                    </button>
                    {filterId && (
                        <button onClick={() => { setFilterId(''); fetchLogs(''); }} className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300">❌</button>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto shadow-lg rounded-lg bg-white">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800 text-gray-200">
                        <tr>
                            <th className="p-3">Time</th>
                            <th className="p-3">Chat ID</th>
                            <th className="p-3">Intent</th>
                            <th className="p-3 w-1/4">User Input</th>
                            <th className="p-3 w-1/4 bg-red-900/20">Raw LLM Output</th>
                            <th className="p-3 w-1/4 bg-green-900/20">Cleaned (Guardrails)</th>
                            <th className="p-3">Latency</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="p-4 text-center">Loading logs...</td></tr>
                        ) : logs.map((log) => (
                            <tr key={log.id} className="border-b hover:bg-gray-50">
                                <td className="p-3 text-gray-500 whitespace-nowrap text-xs">
                                    {new Date(log.created_at).toLocaleTimeString()}
                                </td>
                                <td
                                    className="p-3 text-xs font-mono text-blue-500 cursor-pointer hover:underline"
                                    title={log.conversation_id}
                                    onClick={() => { setFilterId(log.conversation_id); fetchLogs(log.conversation_id); }}
                                >
                                    {log.conversation_id?.substring(0, 8)}...
                                </td>
                                <td className="p-3 font-semibold text-blue-600 text-sm">{log.intent}</td>
                                <td className="p-3 text-gray-800 break-words max-w-xs text-sm">{log.user_message}</td>

                                {/* Visual diff for Raw vs Cleaned */}
                                <td className={`p-3 break-words max-w-xs text-sm ${log.raw_llm_response === '.' ? 'bg-red-100 font-bold text-red-600' : ''
                                    }`}>
                                    {log.raw_llm_response}
                                </td>

                                <td className="p-3 break-words max-w-xs text-green-700 bg-green-50 text-sm">
                                    {log.after_guardrails}
                                </td>

                                <td className="p-3 text-gray-400 text-xs">{log.took_ms}ms</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {logs.length === 0 && !loading && (
                    <div className="p-8 text-center text-gray-500">No logs found in 'llm_logs' table.</div>
                )}
            </div>

            <div className="mt-8">
                <h2 className="text-xl font-bold mb-2">Supabase Check</h2>
                <p className="text-gray-600">
                    Checking connections to table: <code>llm_logs</code>.
                    If empty, ensure <code>route.ts</code> is inserting and RLS allows select.
                </p>
            </div>
        </div>
    );
}
