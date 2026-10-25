/**
 * Upsert the real source files into Supabase reference tables:
 *   data/airports/countries.csv            -> public.countries          (on id)
 *   data/airports/regions.csv              -> public.regions            (on id)
 *   data/airports/airports.csv             -> public.airports           (on id)
 *   data/airports/runways.csv              -> public.runways            (on id)
 *   data/airports/airport-frequencies.csv  -> public.airport_frequencies (on id)
 *   data/airports/navaids.csv              -> public.navaids            (on id)
 *   data/airlines/airlines_full.csv        -> public.airlines           (on ident)
 *   data/aircraft_types/aircraft.csv       -> public.aircraft_types     (on ident)
 * Airport files load in foreign-key order. OurAirports ids are kept so
 * runways.airport_ref, airport_frequencies.airport_ref, and navaids.associated_airport match.
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY (or AVGEEKDB_SUPABASE_SERVICE_ROLE_KEY).
 * Rows go through PostgREST, so the row-level audit trigger (change_log) fires unless it is disabled.
 * --dry-run parses and validates without writing. --only=airports (comma list) limits the tables.
 * airline_hubs is not loaded: there is no real hubs source yet (data/airline_hubs holds SAMPLE rows only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.AVGEEKDB_SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const BATCH = 1000;
if (!dryRun && (!url || !key)) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }

type Val = string | number | boolean | null | string[];
const str = (v: string) => (v.trim() === "" ? null : v.trim());
const bool = (v: string) => { const t = v.trim().toUpperCase(); if (t === "") return null; if (t === "TRUE") return true; if (t === "FALSE") return false; throw new Error(`bad boolean "${v}"`); };
const int = (v: string) => { if (v.trim() === "") return null; const n = Number(v); if (!Number.isInteger(n)) throw new Error(`bad integer "${v}"`); return n; };
const num = (v: string) => { if (v.trim() === "") return null; const n = Number(v); if (!Number.isFinite(n)) throw new Error(`bad number "${v}"`); return n; };
const yesNo = (v: string) => { const t = v.trim().toLowerCase(); return t === "yes" ? true : t === "no" ? false : bool(v); };
const bit = (v: string) => { const t = v.trim(); if (t === "") return null; if (t === "1") return true; if (t === "0") return false; throw new Error(`bad bit "${v}"`); };
const AIRPORT_TYPES = new Set(["large_airport", "medium_airport", "small_airport", "heliport", "seaplane_base", "balloonport", "closed"]);
const CONTINENTS = new Set(["AF", "AN", "AS", "EU", "NA", "OC", "SA"]);
const check = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

interface Spec { table: string; file: string; conflict: string; countFilter: string; map: (r: Record<string, string>) => Record<string, Val> }
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const SPECS_ALL: Spec[] = [
  {
    table: "countries", file: "data/airports/countries.csv", conflict: "id", countFilter: "",
    map: (r) => {
      const row = { id: int(r.id), code: str(r.code), name: str(r.name), continent: str(r.continent), wikipedia_link: str(r.wikipedia_link), keywords: str(r.keywords) };
      check(row.id !== null, "missing id");
      check(!!row.code && /^[A-Z0-9]{2}$/.test(row.code), `code "${row.code}" is not 2 characters`);
      check(!!row.name, "missing name");
      check(row.continent !== null && CONTINENTS.has(row.continent), `continent "${row.continent}" not allowed`);
      return row;
    },
  },
  {
    table: "regions", file: "data/airports/regions.csv", conflict: "id", countFilter: "",
    map: (r) => {
      const row = { id: int(r.id), code: str(r.code), local_code: str(r.local_code), name: str(r.name), continent: str(r.continent), iso_country: str(r.iso_country), wikipedia_link: str(r.wikipedia_link), keywords: str(r.keywords) };
      check(row.id !== null, "missing id");
      check(!!row.code, "missing code");
      check(!!row.name, "missing name");
      check(row.continent !== null && CONTINENTS.has(row.continent), `continent "${row.continent}" not allowed`);
      check(row.iso_country !== null && /^[A-Z0-9]{2}$/.test(row.iso_country), `iso_country "${row.iso_country}" is not 2 characters`);
      return row;
    },
  },
  {
    table: "airports", file: "data/airports/airports.csv", conflict: "id", countFilter: "&is_sample=eq.false",
    map: (r) => {
      const row = {
        id: int(r.id), ident: str(r.ident), type: str(r.type), name: str(r.name),
        latitude_deg: num(r.latitude_deg), longitude_deg: num(r.longitude_deg), elevation_ft: int(r.elevation_ft),
        continent: str(r.continent), iso_country: str(r.iso_country), iso_region: str(r.iso_region), municipality: str(r.municipality),
        scheduled_service: yesNo(r.scheduled_service) ?? false, icao_code: str(r.icao_code), iata_code: str(r.iata_code),
        gps_code: str(r.gps_code), local_code: str(r.local_code), home_link: str(r.home_link), wikipedia_link: str(r.wikipedia_link),
        keywords: str(r.keywords), is_sample: false,
      };
      check(row.id !== null, "missing id");
      check(!!row.ident, "missing ident");
      check(!!row.name, "missing name");
      check(AIRPORT_TYPES.has(String(row.type)), `type "${row.type}" not allowed by airports_type_check`);
      check(row.continent !== null && CONTINENTS.has(row.continent), `continent "${row.continent}" not allowed`);
      check(row.iso_country !== null && /^[A-Z0-9]{2}$/.test(row.iso_country), `iso_country "${row.iso_country}" is not 2 characters`);
      check(!!row.iso_region, "missing iso_region");
      check(row.latitude_deg !== null && row.latitude_deg >= -90 && row.latitude_deg <= 90, `latitude ${row.latitude_deg} out of range`);
      check(row.longitude_deg !== null && row.longitude_deg >= -180 && row.longitude_deg <= 180, `longitude ${row.longitude_deg} out of range`);
      check(row.iata_code === null || row.iata_code.length <= 3, `iata_code "${row.iata_code}" longer than 3`);
      check(row.icao_code === null || row.icao_code.length <= 4, `icao_code "${row.icao_code}" longer than 4`);
      return row;
    },
  },
  {
    table: "runways", file: "data/airports/runways.csv", conflict: "id", countFilter: "",
    map: (r) => {
      const row = {
        id: int(r.id), airport_ref: int(r.airport_ref), airport_ident: str(r.airport_ident),
        length_ft: int(r.length_ft), width_ft: int(r.width_ft), surface: str(r.surface), lighted: bit(r.lighted), closed: bit(r.closed),
        le_ident: str(r.le_ident), le_latitude_deg: num(r.le_latitude_deg), le_longitude_deg: num(r.le_longitude_deg),
        le_elevation_ft: int(r.le_elevation_ft), le_heading_degt: num(r.le_heading_degT), le_displaced_threshold_ft: int(r.le_displaced_threshold_ft),
        he_ident: str(r.he_ident), he_latitude_deg: num(r.he_latitude_deg), he_longitude_deg: num(r.he_longitude_deg),
        he_elevation_ft: int(r.he_elevation_ft), he_heading_degt: num(r.he_heading_degT), he_displaced_threshold_ft: int(r.he_displaced_threshold_ft),
      };
      check(row.id !== null && row.airport_ref !== null && !!row.airport_ident, "missing runway key");
      check(row.lighted !== null && row.closed !== null, "lighted and closed are required");
      return row;
    },
  },
  {
    table: "airport_frequencies", file: "data/airports/airport-frequencies.csv", conflict: "id", countFilter: "",
    map: (r) => {
      const row = { id: int(r.id), airport_ref: int(r.airport_ref), airport_ident: str(r.airport_ident), type: str(r.type), description: str(r.description), frequency_mhz: num(r.frequency_mhz) };
      check(row.id !== null && row.airport_ref !== null && !!row.airport_ident, "missing frequency key");
      check(!!row.type, "missing type");
      check(row.frequency_mhz !== null, "missing frequency_mhz");
      return row;
    },
  },
  {
    table: "navaids", file: "data/airports/navaids.csv", conflict: "id", countFilter: "",
    map: (r) => {
      const row = {
        id: int(r.id), filename: str(r.filename), ident: str(r.ident), name: str(r.name), type: str(r.type),
        frequency_khz: int(r.frequency_khz), latitude_deg: num(r.latitude_deg), longitude_deg: num(r.longitude_deg),
        elevation_ft: int(r.elevation_ft), iso_country: str(r.iso_country), dme_frequency_khz: int(r.dme_frequency_khz),
        dme_channel: str(r.dme_channel), dme_latitude_deg: num(r.dme_latitude_deg), dme_longitude_deg: num(r.dme_longitude_deg),
        dme_elevation_ft: int(r.dme_elevation_ft), slaved_variation_deg: num(r.slaved_variation_deg),
        magnetic_variation_deg: num(r.magnetic_variation_deg), usage_type: str(r.usageType), power: str(r.power),
        associated_airport: str(r.associated_airport),
      };
      check(row.id !== null, "missing id");
      check(!!row.filename && !!row.ident && !!row.name && !!row.type, "missing navaid identity");
      check(row.frequency_khz !== null, "missing frequency_khz");
      check(row.latitude_deg !== null && row.longitude_deg !== null, "missing navaid coordinates");
      check(row.iso_country !== null && /^[A-Z0-9]{2}$/.test(row.iso_country), `iso_country "${row.iso_country}" is not 2 characters`);
      return row;
    },
  },
  {
    table: "airlines", file: "data/airlines/airlines_full.csv", conflict: "ident", countFilter: "&is_sample=eq.false",
    map: (r) => ({
      ident: str(r.ident), name: str(r.name), iata: str(r.iata), icao: str(r.icao), callsign: str(r.callsign),
      country: str(r.country), country_code: str(r.country_code), active: bool(r.active) ?? false, major: bool(r.major) ?? false,
      updated_at: str(r.updated_at), is_sample: false,
    }),
  },
  {
    table: "aircraft_types", file: "data/aircraft_types/aircraft.csv", conflict: "ident", countFilter: "&is_sample=eq.false",
    map: (r) => ({
      ident: str(r.ident), icao: str(r.icao), iata: str(r.iata), family: str(r.family), name: str(r.name), short_name: str(r.short_name),
      alternate_names: list(r.alternate_names), manufacturer: str(r.manufacturer), engine_count: int(r.engine_count),
      engine_type: str(r.engine_type), aircraft_type: str(r.aircraft_type), in_production: bool(r.in_production) ?? false,
      status: str(r.status), major: bool(r.major) ?? false, cargo: bool(r.cargo) ?? false, military: bool(r.military) ?? false,
      wiki_link: str(r.wiki_link), updated_at: str(r.updated_at), is_primary: bool(r.primary) ?? false, is_sample: false,
    }),
  },
];

async function upsert(table: string, conflict: string, rows: Record<string, Val>[]): Promise<string | null> {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: { apikey: key!, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return res.ok ? null : `${res.status} ${await res.text()}`;
}

async function count(table: string, countFilter: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id${countFilter}`, { method: "HEAD", headers: { apikey: key!, authorization: `Bearer ${key}`, prefer: "count=exact", range: "0-0" } });
  return Number(res.headers.get("content-range")?.split("/")[1] ?? NaN);
}

async function main() {
let failed = false;
for (const spec of SPECS_ALL.filter((s) => !ONLY || ONLY.includes(s.table))) {
  const raw = parse(readFileSync(join(process.cwd(), spec.file), "utf8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const rows: Record<string, Val>[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  raw.forEach((r, i) => { try { const m = spec.map(r); const keyCol = spec.conflict; if (m[keyCol] == null || m[keyCol] === "") throw new Error(`missing ${keyCol}`); const stamp = String(m[keyCol]); if (seen.has(stamp)) throw new Error(`duplicate ${keyCol}`); seen.add(stamp); rows.push(m); } catch (e) { rejected.push(`line ${i + 2} (${r.ident ?? r.code ?? r.id}): ${(e as Error).message}`); } });
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const err = await upsert(spec.table, spec.conflict, batch);
      if (!err) continue;
      if (err.includes("PGRST205") || err.startsWith("404")) throw new Error(`${spec.table} batch at row ${i}: ${err}`);
      // Retry row by row so one bad row does not reject the whole batch.
      for (const row of batch) { const e = await upsert(spec.table, spec.conflict, [row]); if (e) rejected.push(`${row[spec.conflict]}: ${e}`); }
    }
  }
  const total = dryRun ? NaN : await count(spec.table, spec.countFilter);
  console.log(`${spec.table}: file=${raw.length} sent=${rows.length} rejected=${rejected.length}${dryRun ? "" : ` table(non-sample)=${total}`}`);
  for (const r of rejected) console.log(`  rejected ${r}`);
  if (rejected.length || (!dryRun && total !== raw.length)) failed = true;
}
process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
