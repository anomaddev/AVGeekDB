import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { KeyRecord, KeyStore } from "./keys";
import type { Entity, Row } from "./types";

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

const COLUMNS: Record<Entity, string> = {
  airports: "ident, type, name, latitude, longitude, elevation_ft, continent, country, iso_region, municipality, scheduled_service, icao, iata, gps_code, local_code, home_link, wikipedia_link, keywords",
  airlines: "id, ident, name, iata, icao, callsign, country, country_code, active, major",
  aircraft_types: "ident, icao, iata, family, name, short_name, alternate_names, manufacturer, engine_count, engine_type, aircraft_type, in_production, status, major, cargo, military, wiki_link, is_primary, wake_category",
};
const ORDER: Record<Entity, string> = { airports: "ident", airlines: "ident", aircraft_types: "ident" };
const trimChars = (r: Record<string, unknown>): Row => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? v.trim() : (v as Row[string])])) as Row;

/**
 * Reads reference tables from Supabase with a short in-memory cache, then reuses the shared queryRows filters.
 * Fine at current table sizes; move filtering into PostgREST once tables reach tens of thousands of rows.
 */
export class SupabaseDataSource {
  private cache = new Map<string, { at: number; value: unknown }>();
  constructor(private client: SupabaseClient, private ttlMs = Number(process.env.AVGEEKDB_CACHE_MS ?? 60_000)) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async all(table: string, columns: string, order: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client.from(table).select(columns).order(order).range(from, from + 999);
      if (error) throw new Error(`${table} read failed: ${error.message}`);
      out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < 1000) return out;
    }
  }

  rows(entity: Entity): Promise<Row[]> {
    return this.cached(`rows:${entity}`, async () => {
      const rows = await this.all(entity, COLUMNS[entity], ORDER[entity]);
      if (entity !== "airlines") return rows.map(trimChars);
      const hubs = await this.all("airline_hubs", "airline_id, is_primary, airports(icao, ident)", "airline_id");
      return rows.map((r) => {
        const own = hubs.filter((h) => h.airline_id === r.id).sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true));
        const { id: _id, ...rest } = r;
        return { ...trimChars(rest), hubs: own.map((h) => { const a = h.airports as { icao: string | null; ident: string } | null; return String(a?.icao ?? a?.ident ?? "").trim(); }).filter(Boolean) };
      });
    });
  }

  version(): Promise<string> {
    return this.cached("version", async () => {
      const { data, error } = await this.client.from("data_versions").select("version").eq("is_current", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`data_versions read failed: ${error.message}`);
      return data?.version ? String(data.version) : "unversioned";
    });
  }
}
