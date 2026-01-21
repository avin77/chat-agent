
'use server';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getLLMLogs(conversationId?: string) {
    try {
        let query = supabase
            .from('llm_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (conversationId) {
            query = query.eq('conversation_id', conversationId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Fetch Logs Error:', error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error('Server Action Error:', e);
        return [];
    }
}
