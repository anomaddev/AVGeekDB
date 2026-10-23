import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import type { Dataset, Entity, Row } from "./types";

/** Column type hints used to coerce CSV strings. Keep in sync with schema/*.schema.json. */
export const COLUMN_TYPES: Record<Dataset, Record<string, "number" | "integer" | "boolean" | "list">> = {
  airports: { latitude: "number", longitude: "number", elevation_ft: "integer", is_sample: "boolean" },
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

/** API-shaped rows: airlines get `hubs` (airport ICAO codes, primary first) from airline_hubs. */
export function loadEntity(entity: Entity, dataDir = findDataDir()): Row[] {
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
