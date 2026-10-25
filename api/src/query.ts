import { formatAirports } from "./airportDocument";
import { airportRelations } from "./dataset";
import type { Entity, Row } from "./types";

export const FILTERS: Record<Entity, string[]> = {
  airports: ["ident", "iata", "icao", "country", "type", "continent", "iso_region", "scheduled_service"],
  airlines: ["ident", "iata", "icao", "country", "country_code", "active", "major", "hub"],
  aircraft_types: ["ident", "icao", "iata", "family", "manufacturer", "engine_type", "aircraft_type", "status", "in_production", "major", "cargo", "military", "is_primary"],
};
export const SEARCH_FIELDS: Record<Entity, string[]> = {
  airports: ["name", "municipality", "iata", "icao", "ident", "keywords"],
  airlines: ["name", "callsign", "iata", "icao", "ident"],
  aircraft_types: ["name", "short_name", "alternate_names", "family", "manufacturer", "icao", "iata", "ident"],
};
export const MAX_LIMIT = 100;

export interface QueryResult { data: Row[]; meta: { total: number; limit: number; offset: number; next_offset: number | null } }

export class QueryError extends Error {}

/** Shared search/filter/paginate handler. Works on in-memory rows (mock) — the Supabase-backed variant applies the same params via PostgREST. */
/** Validated limit/offset (shared by the in-memory and PostgREST paths). */
export function pageParams(params: URLSearchParams): { limit: number; offset: number } {
  const limit = params.has("limit") ? Number(params.get("limit")) : 25;
  const offset = params.has("offset") ? Number(params.get("offset")) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new QueryError(`limit must be 1-${MAX_LIMIT}`);
  if (!Number.isInteger(offset) || offset < 0) throw new QueryError("offset must be >= 0");
  return { limit, offset };
}

export function queryRows(entity: Entity, rows: Row[], params: URLSearchParams): QueryResult {
  const { limit, offset } = pageParams(params);

  let out = rows;
  const q = params.get("q")?.toLowerCase().trim();
  if (q) out = out.filter((r) => SEARCH_FIELDS[entity].some((f) => (Array.isArray(r[f]) ? (r[f] as string[]).join(",") : String(r[f] ?? "")).toLowerCase().includes(q)));
  for (const f of FILTERS[entity]) {
    const v = params.get(f);
    if (v == null) continue;
    if (f === "hub") out = out.filter((r) => Array.isArray(r.hubs) && (r.hubs as string[]).some((h) => h.toLowerCase() === v.toLowerCase()));
    else if (entity === "airports" && f === "scheduled_service") {
      const t = v.toLowerCase();
      const yes = t === "true" || t === "yes";
      const no = t === "false" || t === "no";
      out = yes || no ? out.filter((r) => r.scheduled_service === yes) : [];
    } else out = out.filter((r) => String(r[f] ?? "").toLowerCase() === v.toLowerCase());
  }
  const total = out.length;
  const page = out.slice(offset, offset + limit);
  const data = entity === "airports" ? formatAirports(page, airportRelations()) : page;
  return { data, meta: { total, limit, offset, next_offset: offset + limit < total ? offset + limit : null } };
}
