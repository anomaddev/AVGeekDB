import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import type { Entity, Row } from "./types";

/** Column type hints used to coerce CSV strings. Keep in sync with schema/*.schema.json. */
export const COLUMN_TYPES: Record<Entity, Record<string, "number" | "integer" | "boolean">> = {
  airports: { latitude: "number", longitude: "number", elevation_ft: "integer", is_sample: "boolean" },
  airlines: { active: "boolean", is_sample: "boolean" },
  aircraft_types: { engine_count: "integer", is_sample: "boolean" },
};

export function coerceRow(entity: Entity, raw: Record<string, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw)) {
    const t = COLUMN_TYPES[entity][k];
    if (v === "") out[k] = null;
    else if (t === "number") out[k] = Number(v);
    else if (t === "integer") out[k] = parseInt(v, 10);
    else if (t === "boolean") out[k] = v === "true";
    else out[k] = v;
  }
  return out;
}

/** Locate repo `data/` dir: $AVGEEKDB_DATA_DIR or walk up from cwd. */
export function findDataDir(start = process.cwd()): string {
  if (process.env.AVGEEKDB_DATA_DIR) return process.env.AVGEEKDB_DATA_DIR;
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "data", "airports"))) return join(dir, "data");
    const up = dirname(dir);
    if (up === dir) throw new Error("data/ directory not found");
    dir = up;
  }
}

export function loadEntity(entity: Entity, dataDir = findDataDir()): Row[] {
  const csv = readFileSync(join(dataDir, entity, `${entity}.csv`), "utf8");
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((r) => coerceRow(entity, r));
}

/** Current dataset version (data/VERSION, overridable via DATA_VERSION). In Supabase mode: latest row of data_versions. */
export function currentDataVersion(dataDir = findDataDir()): string {
  if (process.env.DATA_VERSION) return process.env.DATA_VERSION;
  try { return readFileSync(join(dataDir, "VERSION"), "utf8").trim(); } catch { return "unversioned"; }
}
