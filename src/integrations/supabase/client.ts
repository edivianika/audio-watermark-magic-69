// Prefer Vite env in production; fallbacks keep local/dev working without .env
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const envKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = envUrl || 'https://srwepolmyazwppjnemuy.supabase.co';
const SUPABASE_KEY =
  envKey || 'sb_publishable_nM5fH3-J_9CZadQoVNrCgA_oB_cweJC';

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
