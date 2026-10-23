/** Public Supabase settings. Safe to import from client components — no service key. */

export function supabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url || url.includes("YOUR-PROJECT")) return null;
  return url;
}

export function supabasePublishableKey(): string | null {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!key || key.startsWith("your-")) return null;
  return key;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export const SUPABASE_SETUP_HINT =
  "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local. See .env.example.";
