/**
 * Validates data/<entity>/<entity>.csv against schema/<entity>.schema.json and writes
 * CSV, JSON, and SQLite dumps plus manifest.json into outDir.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { stringify } from "csv-stringify/sync";
import Database from "better-sqlite3";
import { DATASETS, loadDataset, findDataDir, currentDataVersion, type Dataset, type Row } from "../api/src";

export type DownloadFormat = "csv" | "json" | "sqlite";

export interface ArtifactFile {
  path: string;
  bytes: number;
  sha256: string;
  format: DownloadFormat;
  dataset: Dataset | "avgeekdb";
  rows: number;
}

export interface ArtifactManifest {
  data_version: string;
  sample: boolean;
  generated_at: string;
  files: ArtifactFile[];
}

function cell(value: unknown): string | number | null {
  if (typeof value === "boolean") return Number(value);
  if (Array.isArray(value)) return value.join(",");
  if (value == null) return null;
  return value as string | number;
}

function isSampleSet(rows: Row[]): boolean {
  return rows.length > 0 && rows.every((row) => row.is_sample === true);
}

/** Build CSV, JSON, and SQLite downloads. Throws if a row fails schema or referential checks. */
export function buildArtifacts(outDir: string, now = new Date()): ArtifactManifest {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "csv"), { recursive: true });
  mkdirSync(join(outDir, "json"), { recursive: true });

  const root = join(findDataDir(), "..");
  const version = currentDataVersion();
  const ajv = new Ajv2020({ allErrors: true });
  const db = new Database(join(outDir, "avgeekdb.sqlite"));
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT INTO meta VALUES ('data_version', ?)").run(version);

  let failed = false;
  const loaded = DATASETS.map((entity) => ({ entity, rows: loadDataset(entity) }));
  const sample = loaded.every(({ rows }) => isSampleSet(rows));
  let totalRows = 0;

  for (const { entity, rows } of loaded) {
    const schema = JSON.parse(readFileSync(join(root, "schema", `${entity}.schema.json`), "utf8")) as { properties: Record<string, unknown> };
    const validate = ajv.compile(schema);
    rows.forEach((row, i) => {
      if (!validate(row)) { failed = true; console.error(`${entity} row ${i + 2}:`, ajv.errorsText(validate.errors)); }
    });
    writeFileSync(join(outDir, "json", `${entity}.json`), JSON.stringify({ data_version: version, sample: isSampleSet(rows), data: rows }, null, 2));
    const flat = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])));
    writeFileSync(join(outDir, "csv", `${entity}.csv`), `# avgeekdb data_version=${version}\n` + stringify(flat, { header: true, cast: { boolean: (b) => String(b) } }));

    const cols = Object.keys(schema.properties);
    db.exec(`CREATE TABLE ${entity} (${cols.map((col) => `"${col}"`).join(", ")})`);
    const insert = db.prepare(`INSERT INTO ${entity} VALUES (${cols.map(() => "?").join(", ")})`);
    db.transaction(() => rows.forEach((row) => insert.run(cols.map((col) => cell(row[col])))))();
    totalRows += rows.length;
    console.log(`${entity}: ${rows.length} rows`);
  }
  db.close();

  const byEntity = Object.fromEntries(loaded.map(({ entity, rows }) => [entity, rows])) as Record<Dataset, Row[]>;
  const airlineIcao = new Set(byEntity.airlines.map((row) => row.icao));
  const airportIcao = new Set(byEntity.airports.map((row) => row.icao));
  byEntity.airline_hubs.forEach((hub, i) => {
    if (!airlineIcao.has(hub.airline_icao) || !airportIcao.has(hub.airport_icao)) {
      failed = true;
      console.error(`airline_hubs row ${i + 2}: unknown airline/airport`, hub);
    }
  });
  if (failed) throw new Error("Validation failed");

  const listed: Pick<ArtifactFile, "path" | "format" | "dataset" | "rows">[] = [
    ...DATASETS.flatMap((entity) => {
      const rows = byEntity[entity].length;
      return [
        { path: `csv/${entity}.csv`, format: "csv" as const, dataset: entity, rows },
        { path: `json/${entity}.json`, format: "json" as const, dataset: entity, rows },
      ];
    }),
    { path: "avgeekdb.sqlite", format: "sqlite" as const, dataset: "avgeekdb" as const, rows: totalRows },
  ];
  const files: ArtifactFile[] = listed.map((item) => {
    const buf = readFileSync(join(outDir, item.path));
    return { ...item, bytes: statSync(join(outDir, item.path)).size, sha256: createHash("sha256").update(buf).digest("hex") };
  });
  const manifest: ArtifactManifest = { data_version: version, sample, generated_at: now.toISOString(), files };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
