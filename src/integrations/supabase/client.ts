// Prefer Vite env in production; fallbacks keep local/dev working without .env
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getViteSupabaseKey, getViteSupabaseUrl } from '@/lib/supabaseEnv';

const SUPABASE_URL = getViteSupabaseUrl();
const SUPABASE_KEY = getViteSupabaseKey();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// This app only uses Storage + anon REST (no Supabase Auth UI). Without this,
// supabase-js still reads localStorage and calls auth/v1/token (refresh), which
// spams the console and fails oddly when DNS/network is flaky.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
