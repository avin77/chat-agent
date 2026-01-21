
// src/core/db/client.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from './schema';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
