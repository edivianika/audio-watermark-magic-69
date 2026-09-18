/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEPARATION_API_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy JWT anon key from Supabase dashboard (still supported) */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
