import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { formatAirports, indexRelations, type DocRow } from "./airportDocument";
import type { KeyRecord, KeyStore } from "./keys";
import type { Entity, Row } from "./types";
import { COLUMN_TYPES } from "./dataset";
import { FILTERS, pageParams, type QueryResult } from "./query";

/** Escape LIKE metacharacters so user input matches literally (PostgREST maps `*` to `%`). */
const likeLiteral = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Quote a value for use inside a PostgREST or=(...) list (hub lookup). */
const orQuote = (v: string) => `"${v.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
const HUBS_EMBED = "airline_hubs(is_primary, airports(icao_code, ident))";
/** Stored OurAirports names and the published API names. */
const AIRPORT_FROM_DB: Record<string, string> = { iata_code: "iata", icao_code: "icao", iso_country: "country", latitude_deg: "latitude", longitude_deg: "longitude" };
const AIRPORT_TO_DB: Record<string, string> = { iata: "iata_code", icao: "icao_code", country: "iso_country", latitude: "latitude_deg", longitude: "longitude_deg" };
const airportColumn = (field: string) => AIRPORT_TO_DB[field] ?? field;
type Builder = any; // eslint-disable-line @typescript-eslint/no-explicit-any

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

  async findByPrefix(prefix: string): Promise<(KeyRecord & { key_hash: string })[]> {
    const { data, error } = await this.client.from("api_keys").select("id, user_id, revoked_at, key_hash").eq("prefix", prefix).limit(10);
    if (error) throw new Error(`API key lookup failed: ${error.message}`);
    return (data ?? []).map((d) => ({ id: String(d.id), user_id: String(d.user_id), revoked_at: d.revoked_at ? String(d.revoked_at) : null, key_hash: String(d.key_hash) }));
  }

  async recordUsage(keyId: string, endpoint: string, status: number): Promise<void> {
    const [{ error }, { error: touchError }] = await Promise.all([
      this.client.from("api_usage").insert({ api_key_id: keyId, endpoint, status }),
      this.client.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId),
    ]);
    if (error) throw new Error(`API usage insert failed: ${error.message}`);
    if (touchError) throw new Error(`API key touch failed: ${touchError.message}`);
  }
}

const COUNTRY_COLUMNS = "id, code, name, continent, wikipedia_link, keywords";
const REGION_COLUMNS = "id, code, local_code, name, continent, iso_country, wikipedia_link, keywords";
const RUNWAY_COLUMNS = "id, airport_ref, airport_ident, length_ft, width_ft, surface, lighted, closed, le_ident, le_latitude_deg, le_longitude_deg, le_elevation_ft, le_heading_degt, le_displaced_threshold_ft, he_ident, he_latitude_deg, he_longitude_deg, he_elevation_ft, he_heading_degt, he_displaced_threshold_ft";
const FREQ_COLUMNS = "id, airport_ref, airport_ident, type, description, frequency_mhz";
const NAVAID_COLUMNS = "id, filename, ident, name, type, frequency_khz, latitude_deg, longitude_deg, elevation_ft, iso_country, dme_frequency_khz, dme_channel, dme_latitude_deg, dme_longitude_deg, dme_elevation_ft, slaved_variation_deg, magnetic_variation_deg, usage_type, power, associated_airport";

const COLUMNS: Record<Entity, string> = {
  airports: "ident, iata_code, icao_code, name, municipality, iso_country, latitude_deg, longitude_deg, elevation_ft, type, continent, iso_region, scheduled_service, gps_code, local_code, home_link, wikipedia_link, keywords, is_sample",
  airlines: "id, ident, name, iata, icao, callsign, country, country_code, active, major, is_sample",
  aircraft_types: "ident, icao, iata, family, name, short_name, alternate_names, manufacturer, engine_count, engine_type, aircraft_type, in_production, status, major, cargo, military, wiki_link, is_primary, wake_category, is_sample",
};
const ORDER: Record<Entity, string> = { airports: "ident", airlines: "ident", aircraft_types: "ident" };
const trimChars = (r: Record<string, unknown>): Row => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? v.trim() : (v as Row[string])])) as Row;
/** Map stored OurAirports names back to the published airport fields. */
const presentAirport = (r: Record<string, unknown>): Row => trimChars(Object.fromEntries(Object.entries(r).map(([k, v]) => [AIRPORT_FROM_DB[k] ?? k, v])));

/**
 * Live data source. query() pushes each request down to PostgREST; rows() (whole table, cached) is kept for exports/tools.
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
      if (entity === "airports") return rows.map(presentAirport);
      if (entity !== "airlines") return rows.map(trimChars);
      const hubs = await this.all("airline_hubs", "airline_id, is_primary, airports(icao_code, ident)", "airline_id");
      return rows.map((r) => {
        const own = hubs.filter((h) => h.airline_id === r.id).sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true));
        const { id: _id, ...rest } = r;
        return { ...trimChars(rest), hubs: own.map((h) => { const a = h.airports as { icao_code: string | null; ident: string } | null; return String(a?.icao_code ?? a?.ident ?? "").trim(); }).filter(Boolean) };
      });
    });
  }

  /**
   * Pushes one request down to PostgREST: same filters, q search, ordering and paging as queryRows(), with count=exact.
   * Equality filters are case-insensitive (ilike on the literal value), matching the in-memory behaviour.
   */
  async query(entity: Entity, params: URLSearchParams): Promise<QueryResult> {
    const { limit, offset } = pageParams(params);
    const types = COLUMN_TYPES[entity];
    const empty = { data: [], meta: { total: 0, limit, offset, next_offset: null } };
    const apply = async (b: Builder): Promise<Builder | null> => {
      for (const f of FILTERS[entity]) {
        const v = params.get(f);
        if (v == null) continue;
        const column = entity === "airports" ? airportColumn(f) : f;
        if (f === "hub") {
          const ids = await this.airlineIdsForHub(v);
          if (!ids.length) return null;
          b = b.in("id", ids);
        } else if (types[f] === "boolean") {
          const t = v.toLowerCase();
          const yes = t === "true" || (entity === "airports" && f === "scheduled_service" && t === "yes");
          const no = t === "false" || (entity === "airports" && f === "scheduled_service" && t === "no");
          if (!yes && !no) return null;
          b = b.eq(column, yes);
        } else if (types[f] === "number" || types[f] === "integer") {
          if (!Number.isFinite(Number(v))) return null;
          b = b.eq(column, v);
        } else if (v === "") b = b.or(`${column}.is.null,${column}.eq.""`);
        else b = b.ilike(column, likeLiteral(v));
      }
      return b;
    };
    const q = params.get("q")?.trim();
    // Unfiltered lists use the planner estimate (airports has 85k rows); any filter or q gets an exact count.
    const filtered = !!q || FILTERS[entity].some((f) => params.has(f));
    const count = filtered ? "exact" : "estimated";
    // q goes through public.search_<entity>(q) (security invoker, trigram-indexed); filters/paging chain onto it.
    const base = (cols: string, opts: { count: "exact" | "estimated"; head?: boolean }) =>
      q ? this.client.rpc(`search_${entity}`, { q }, opts).select(cols) : this.client.from(entity).select(cols, opts);
    const cols = entity === "airlines" ? `${COLUMNS[entity]}, ${HUBS_EMBED}` : entity === "airports" ? `id, ${COLUMNS[entity]}` : COLUMNS[entity];
    const b = await apply(base(cols, { count }).order(ORDER[entity]).range(offset, offset + limit - 1));
    if (!b) return empty;
    let { data, count: n, error } = await b;
    if (error?.code === "PGRST103") { // offset past the end: PostgREST refuses the range, so count separately
      const head = await apply(base(ORDER[entity], { count, head: true }));
      ({ count: n, error } = await head);
      data = [];
    }
    if (error) throw new Error(`${entity} query failed: ${error.message}`);
    const total = n ?? 0;
    const raw = (data ?? []) as Record<string, unknown>[];
    const rows = entity === "airports" ? await this.airportDocuments(raw) : raw.map((r) => {
      if (entity !== "airlines") return trimChars(r);
      const { id: _id, airline_hubs: hubs, ...rest } = r;
      const own = [...((hubs ?? []) as { is_primary: boolean; airports: { icao_code: string | null; ident: string } | null }[])]
        .sort((a, c) => Number(c.is_primary === true) - Number(a.is_primary === true));
      return { ...trimChars(rest), hubs: own.map((h) => String(h.airports?.icao_code ?? h.airports?.ident ?? "").trim()).filter(Boolean) };
    });
    return { data: rows, meta: { total, limit, offset, next_offset: offset + limit < total ? offset + limit : null } };
  }

  /** Country, region, runways, frequencies, and navaids for the airports on this page. */
  private async airportDocuments(airports: Record<string, unknown>[]): Promise<Row[]> {
    if (!airports.length) return [];
    const ids = [...new Set(airports.map((row) => row.id).filter((id) => id != null))] as (string | number)[];
    const idents = [...new Set(airports.map((row) => String(row.ident ?? "").trim()).filter(Boolean))];
    const countryCodes = [...new Set(airports.map((row) => String(row.iso_country ?? "").trim()).filter(Boolean))];
    const regionCodes = [...new Set(airports.map((row) => String(row.iso_region ?? "").trim()).filter(Boolean))];
    const [countries, regions, runways, freqs, navaids] = await Promise.all([
      this.related("countries", COUNTRY_COLUMNS, "code", countryCodes),
      this.related("regions", REGION_COLUMNS, "code", regionCodes),
      this.related("runways", RUNWAY_COLUMNS, "airport_ref", ids),
      this.related("airport_frequencies", FREQ_COLUMNS, "airport_ref", ids),
      this.related("navaids", NAVAID_COLUMNS, "associated_airport", idents),
    ]);
    return formatAirports(airports, indexRelations({ countries, regions, runways, freqs, navaids }));
  }

  private async related(table: string, columns: string, column: string, values: (string | number)[]): Promise<DocRow[]> {
    if (!values.length) return [];
    const out: DocRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client.from(table).select(columns).in(column, values).order("id").range(from, from + 999);
      if (error) throw new Error(`${table} read failed: ${error.message}`);
      out.push(...((data ?? []) as unknown as DocRow[]));
      if (!data || data.length < 1000) return out;
    }
  }

  /** Airline ids whose hub airport has this ICAO code (or ident, when the airport has no ICAO), case-insensitive. */
  private async airlineIdsForHub(code: string): Promise<number[]> {
    const lit = orQuote(likeLiteral(code));
    const { data: aps, error } = await this.client.from("airports").select("id").or(`icao_code.ilike.${lit},and(icao_code.is.null,ident.ilike.${lit})`);
    if (error) throw new Error(`hub airport lookup failed: ${error.message}`);
    if (!aps?.length) return [];
    const { data: hubs, error: e2 } = await this.client.from("airline_hubs").select("airline_id").in("airport_id", aps.map((a) => a.id));
    if (e2) throw new Error(`hub lookup failed: ${e2.message}`);
    return [...new Set((hubs ?? []).map((h) => Number(h.airline_id)))];
  }

  version(): Promise<string> {
    return this.cached("version", async () => {
      const { data, error } = await this.client.from("data_versions").select("version").eq("is_current", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`data_versions read failed: ${error.message}`);
      return data?.version ? String(data.version) : "unversioned";
    });
  }
}
