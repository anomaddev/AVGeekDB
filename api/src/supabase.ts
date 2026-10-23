import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { KeyRecord, KeyStore } from "./keys";

function configured(value: string | undefined, placeholders: string[]): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || placeholders.some((p) => trimmed === p || trimmed.includes(p))) return null;
  return trimmed;
}

/** Service-role client. Server only — this key bypasses RLS. */
export function createServiceClient(): SupabaseClient {
  const url = configured(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, ["YOUR-PROJECT"]);
  const key = configured(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY, ["your-service-role-key", "your-secret-key"]);
  if (!url || !key) throw new Error("Supabase service credentials are not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Looks up peppered API key hashes and writes usage. Uses the service role because callers are unauthenticated. */
export class SupabaseKeyStore implements KeyStore {
  constructor(private client: SupabaseClient) {}

  async findByHash(hash: string): Promise<KeyRecord | null> {
    const { data, error } = await this.client.from("api_keys").select("id, user_id, revoked_at").eq("key_hash", hash).maybeSingle();
    if (error) throw new Error(`API key lookup failed: ${error.message}`);
    if (!data) return null;
    return { id: String(data.id), user_id: String(data.user_id), revoked_at: data.revoked_at ? String(data.revoked_at) : null };
  }

  async recordUsage(keyId: string, endpoint: string, status: number): Promise<void> {
    const { error } = await this.client.from("api_usage").insert({ api_key_id: keyId, endpoint, status });
    if (error) throw new Error(`API usage insert failed: ${error.message}`);
    const { error: touchError } = await this.client.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
    if (touchError) throw new Error(`API key touch failed: ${touchError.message}`);
  }
}
