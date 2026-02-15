// =============================================
// NexoBot MVP — Supabase Client
// =============================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const isValidConfig = supabaseUrl && supabaseKey
    && !supabaseUrl.includes('your-project')
    && !supabaseKey.includes('your-anon-key');

if (!isValidConfig) {
    console.warn('⚠️  Supabase not configured. Using in-memory storage.');
}

export const supabase = isValidConfig
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export default supabase;
