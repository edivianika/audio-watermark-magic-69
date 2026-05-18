const DEFAULT_SUPABASE_URL = "https://srwepolmyazwppjnemuy.supabase.co";
const DEFAULT_SUPABASE_KEY =
  "sb_publishable_nM5fH3-J_9CZadQoVNrCgA_oB_cweJC";

/** Strip BOM, CR, trim — CRLF in `.env` often leaves `\r` on values and breaks DNS / apikey. */
export function normalizeEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
}

/** Resolved Supabase project URL (browser / Vite). */
export function getViteSupabaseUrl(): string {
  return normalizeSupabaseUrl(
    normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL,
  );
}

/** Resolved publishable or legacy anon key. */
export function getViteSupabaseKey(): string {
  return (
    normalizeEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
    normalizeEnvValue(DEFAULT_SUPABASE_KEY) ||
    ""
  );
}

const NETWORKISH =
  /failed to fetch|networkerror|load failed|err_name_not_resolved|fetch.*abort|net::err|network request failed/i;

/** If the error looks like DNS / connectivity, return a short user-facing hint (Indonesian). */
export function userFacingSupabaseNetworkHint(rawMessage: string | undefined): string | null {
  const msg = rawMessage ?? "";
  if (!NETWORKISH.test(msg)) return null;
  const host = new URL(getViteSupabaseUrl()).host;
  return (
    `Tidak bisa menjangkau ${host} (DNS/jaringan). ` +
    "Ini biasanya di perangkat atau jaringan Anda, bukan dari kode aplikasi. " +
    "Coba: nonaktifkan VPN, ganti DNS ke 8.8.8.8 atau 1.1.1.1, tethering ke HP, atau cek blokir router/antivirus/extension. " +
    `Uji cepat: buka https://${host} di tab baru — jika tidak terbuka, DNS Anda tidak menemukan server.`
  );
}

export function normalizeSupabaseUrl(url: string): string {
  const u = normalizeEnvValue(url) ?? "";
  return u.replace(/\/+$/, "");
}

/** Human-readable PostgREST / DB API error for toasts. */
export function formatPostgrestError(err: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  return [err.message, err.code, err.details, err.hint].filter(Boolean).join(" · ");
}

/** Storage API errors are loosely typed; surface message + status if present. */
export function formatStorageError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const o = err as Record<string, unknown>;
  const parts = [o.message, o.statusCode, o.error].filter(Boolean);
  return parts.length ? String(parts.join(" · ")) : JSON.stringify(err);
}
