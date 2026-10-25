import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { indexRelations, type AirportRelations, type DocRow } from "./airportDocument";
import type { Dataset, Entity, Row } from "./types";

/** Column type hints used to coerce CSV strings. Keep in sync with schema/*.schema.json. */
export const COLUMN_TYPES: Record<Dataset, Record<string, "number" | "integer" | "boolean" | "list">> = {
  airports: { latitude: "number", longitude: "number", elevation_ft: "integer", scheduled_service: "boolean", is_sample: "boolean" },
  airlines: { active: "boolean", major: "boolean", is_sample: "boolean" },
  aircraft_types: {
    engine_count: "integer", alternate_names: "list", in_production: "boolean", major: "boolean", cargo: "boolean",
    military: "boolean", is_primary: "boolean", is_sample: "boolean",
  },
  airline_hubs: { is_primary: "boolean", is_sample: "boolean" },
};

export function coerceRow(entity: Dataset, raw: Record<string, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw)) {
    const t = COLUMN_TYPES[entity][k];
    if (t === "list") out[k] = v.split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "") out[k] = null;
    else if (t === "number") out[k] = Number(v);
    else if (t === "integer") out[k] = parseInt(v, 10);
    else if (t === "boolean") out[k] = v.toLowerCase() === "true";
    else out[k] = v;
  }
  return out;
}

/**
 * Locate the `data/` dir: $AVGEEKDB_DATA_DIR, else `data/` in cwd or up to two parents.
 * Fixed candidates (no filesystem walk) keep Next's output tracing from pulling in the whole project.
 * In the standalone bundle server.js chdirs to `.next/standalone/web`, so `../data` resolves.
 */
export function findDataDir(start = process.cwd()): string {
  if (process.env.AVGEEKDB_DATA_DIR) return process.env.AVGEEKDB_DATA_DIR;
  for (const rel of ["data", "../data", "../../data"]) {
    const dir = resolve(/* turbopackIgnore: true */ start, rel);
    if (existsSync(join(dir, "airports"))) return dir;
  }
  throw new Error("data/ directory not found (set AVGEEKDB_DATA_DIR)");
}

/** Raw CSV rows as stored in data/ (no joins). */
export function loadDataset(entity: Dataset, dataDir = findDataDir()): Row[] {
  const csv = readFileSync(join(dataDir, entity, `${entity}.csv`), "utf8");
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((r) => coerceRow(entity, r));
}

const airportBundles = new Map<string, { rows: Row[]; relations: AirportRelations }>();

function readAirportCsv(dataDir: string, file: string): DocRow[] {
  const csv = readFileSync(join(dataDir, "airports", file), "utf8");
  return parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as DocRow[];
}

function blank(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

/** Flat filter rows (iata, icao, country, boolean scheduled_service) plus the source columns the document formatter reads. */
function airportFilterRow(raw: DocRow): Row {
  const our = "latitude_deg" in raw || "iata_code" in raw || "iso_country" in raw;
  const scheduled = String(raw.scheduled_service ?? "").trim().toLowerCase();
  if (!our) {
    const row = coerceRow("airports", raw as Record<string, string>);
    row.id = raw.id == null ? null : String(raw.id);
    return row;
  }
  return {
    id: raw.id == null ? null : String(raw.id),
    ident: String(raw.ident ?? ""),
    type: String(raw.type ?? ""),
    name: String(raw.name ?? ""),
    municipality: blank(raw.municipality),
    iata: blank(raw.iata_code),
    icao: blank(raw.icao_code),
    country: String(raw.iso_country ?? "").trim(),
    continent: String(raw.continent ?? "").trim(),
    iso_region: String(raw.iso_region ?? "").trim(),
    scheduled_service: scheduled === "yes" || scheduled === "true" || scheduled === "1",
    keywords: blank(raw.keywords),
    iata_code: String(raw.iata_code ?? ""),
    icao_code: String(raw.icao_code ?? ""),
    iso_country: String(raw.iso_country ?? "").trim(),
    latitude_deg: String(raw.latitude_deg ?? ""),
    longitude_deg: String(raw.longitude_deg ?? ""),
    elevation_ft: String(raw.elevation_ft ?? ""),
    gps_code: String(raw.gps_code ?? ""),
    local_code: String(raw.local_code ?? ""),
    home_link: String(raw.home_link ?? ""),
    wikipedia_link: String(raw.wikipedia_link ?? ""),
    is_sample: String(raw.is_sample ?? "").toLowerCase() === "true",
  };
}

function airportBundle(dataDir: string): { rows: Row[]; relations: AirportRelations } {
  const hit = airportBundles.get(dataDir);
  if (hit) return hit;
  const rows = readAirportCsv(dataDir, "airports.csv").map(airportFilterRow);
  const relations = indexRelations({
    countries: readAirportCsv(dataDir, "countries.csv"),
    regions: readAirportCsv(dataDir, "regions.csv"),
    runways: readAirportCsv(dataDir, "runways.csv"),
    freqs: readAirportCsv(dataDir, "airport-frequencies.csv"),
    navaids: readAirportCsv(dataDir, "navaids.csv"),
  });
  const bundle = { rows, relations };
  airportBundles.set(dataDir, bundle);
  return bundle;
}

/** Country, region, runway, frequency, and navaid rows for the in-memory airport documents. */
export function airportRelations(dataDir = findDataDir()): AirportRelations {
  return airportBundle(dataDir).relations;
}

/** API-shaped rows: airlines get `hubs` (airport ICAO codes, primary first) from airline_hubs. Airports keep filter aliases plus source columns. */
export function loadEntity(entity: Entity, dataDir = findDataDir()): Row[] {
  if (entity === "airports") return airportBundle(dataDir).rows;
  const rows = loadDataset(entity, dataDir);
  if (entity !== "airlines") return rows;
  const hubs = loadDataset("airline_hubs", dataDir).sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true));
  return rows.map((r) => ({ ...r, hubs: hubs.filter((h) => h.airline_icao === r.icao).map((h) => String(h.airport_icao)) }));
}

/** Current dataset version (data/VERSION, overridable via DATA_VERSION). In Supabase mode: latest row of data_versions. */
export function currentDataVersion(dataDir = findDataDir()): string {
  if (process.env.DATA_VERSION) return process.env.DATA_VERSION;
  try { return readFileSync(join(dataDir, "VERSION"), "utf8").trim(); } catch { return "unversioned"; }
}
