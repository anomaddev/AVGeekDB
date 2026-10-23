import type { Entity, Row } from "./types";

export const FILTERS: Record<Entity, string[]> = {
  airports: ["ident", "iata", "icao", "country", "type", "continent", "iso_region", "scheduled_service"],
  airlines: ["ident", "iata", "icao", "country", "country_code", "active", "major", "hub"],
  aircraft_types: ["ident", "icao", "iata", "family", "manufacturer", "engine_type", "aircraft_type", "status", "in_production", "major", "cargo", "military", "is_primary"],
};
const SEARCH_FIELDS: Record<Entity, string[]> = {
  airports: ["name", "municipality", "iata", "icao", "ident", "keywords"],
  airlines: ["name", "callsign", "iata", "icao", "ident"],
  aircraft_types: ["name", "short_name", "alternate_names", "family", "manufacturer", "icao", "iata", "ident"],
};
export const MAX_LIMIT = 100;

export interface QueryResult { data: Row[]; meta: { total: number; limit: number; offset: number; next_offset: number | null } }

export class QueryError extends Error {}

/** Shared search/filter/paginate handler. Works on in-memory rows (mock) — the Supabase-backed variant applies the same params via PostgREST. */
export function queryRows(entity: Entity, rows: Row[], params: URLSearchParams): QueryResult {
  const limit = params.has("limit") ? Number(params.get("limit")) : 25;
  const offset = params.has("offset") ? Number(params.get("offset")) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new QueryError(`limit must be 1-${MAX_LIMIT}`);
  if (!Number.isInteger(offset) || offset < 0) throw new QueryError("offset must be >= 0");

  let out = rows;
  const q = params.get("q")?.toLowerCase().trim();
  if (q) out = out.filter((r) => SEARCH_FIELDS[entity].some((f) => (Array.isArray(r[f]) ? (r[f] as string[]).join(",") : String(r[f] ?? "")).toLowerCase().includes(q)));
  for (const f of FILTERS[entity]) {
    const v = params.get(f);
    if (v == null) continue;
    if (f === "hub") out = out.filter((r) => Array.isArray(r.hubs) && r.hubs.some((h) => h.toLowerCase() === v.toLowerCase()));
    else out = out.filter((r) => String(r[f] ?? "").toLowerCase() === v.toLowerCase());
  }
  const total = out.length;
  const data = out.slice(offset, offset + limit);
  return { data, meta: { total, limit, offset, next_offset: offset + limit < total ? offset + limit : null } };
}
