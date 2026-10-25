/**
 * SQLite shape of the public Supabase reference tables.
 * Column names match Postgres. Secret and account tables are not in this list.
 */
import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, statSync } from "node:fs";
import Database from "better-sqlite3";

export const EXCLUDED_TABLES = ["api_keys", "api_usage", "user_roles", "submissions", "change_log"] as const;

type Affinity = "INTEGER" | "REAL" | "TEXT";

interface SqliteColumn {
  name: string;
  type: Affinity;
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
  references?: { table: string; column: string };
}

interface SqliteForeignKey {
  columns: string[];
  table: string;
  refColumns: string[];
}

export interface SqliteTable {
  name: string;
  columns: SqliteColumn[];
  /** Composite primary key. Single-column keys are set on the column. */
  primaryKey?: string[];
  unique?: string[][];
  foreignKeys?: SqliteForeignKey[];
  /** Extra indexes, used for foreign-key columns that are not already the primary key. */
  indexes: string[];
  /** PostgREST order. */
  order: string;
}

const pk = { primaryKey: true };
const req = { notNull: true };
const uniq = { unique: true };
const int = (name: string, extra: Partial<SqliteColumn> = {}): SqliteColumn => ({ name, type: "INTEGER", ...extra });
const text = (name: string, extra: Partial<SqliteColumn> = {}): SqliteColumn => ({ name, type: "TEXT", ...extra });
const real = (name: string, extra: Partial<SqliteColumn> = {}): SqliteColumn => ({ name, type: "REAL", ...extra });
const ref = (table: string, column = "id") => ({ references: { table, column } });

export const SQLITE_TABLES: SqliteTable[] = [
  {
    name: "data_versions",
    order: "id",
    indexes: [],
    columns: [
      int("id", pk),
      text("version", { ...req, ...uniq }),
      text("released_on", req),
      text("notes"),
      int("is_current", req),
      text("created_by"),
      text("created_at", req),
    ],
  },
  {
    name: "countries",
    order: "id",
    indexes: [],
    columns: [
      int("id", pk),
      text("code", { ...req, ...uniq }),
      text("name", req),
      text("continent", req),
      text("wikipedia_link"),
      text("keywords"),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "regions",
    order: "id",
    indexes: ["iso_country"],
    columns: [
      int("id", pk),
      text("code", { ...req, ...uniq }),
      text("local_code"),
      text("name", req),
      text("continent", req),
      text("iso_country", { ...req, ...ref("countries", "code") }),
      text("wikipedia_link"),
      text("keywords"),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "airports",
    order: "id",
    indexes: ["iso_country", "iso_region", "data_version_id"],
    unique: [["id", "ident"]],
    columns: [
      int("id", pk),
      text("ident", { ...req, ...uniq }),
      text("type", req),
      text("name", req),
      real("latitude_deg", req),
      real("longitude_deg", req),
      int("elevation_ft"),
      text("continent", req),
      text("iso_country", { ...req, ...ref("countries", "code") }),
      text("iso_region", { ...req, ...ref("regions", "code") }),
      text("municipality"),
      int("scheduled_service", req),
      text("icao_code", uniq),
      text("iata_code"),
      text("gps_code"),
      text("local_code"),
      text("home_link"),
      text("wikipedia_link"),
      text("keywords"),
      int("is_sample", req),
      text("updated_at", req),
      int("data_version_id", ref("data_versions")),
      int("row_version", req),
    ],
  },
  {
    name: "runways",
    order: "id",
    indexes: ["airport_ref"],
    foreignKeys: [{ columns: ["airport_ref", "airport_ident"], table: "airports", refColumns: ["id", "ident"] }],
    columns: [
      int("id", pk),
      int("airport_ref", req),
      text("airport_ident", req),
      int("length_ft"),
      int("width_ft"),
      text("surface"),
      int("lighted", req),
      int("closed", req),
      text("le_ident"),
      real("le_latitude_deg"),
      real("le_longitude_deg"),
      int("le_elevation_ft"),
      real("le_heading_degT"),
      int("le_displaced_threshold_ft"),
      text("he_ident"),
      real("he_latitude_deg"),
      real("he_longitude_deg"),
      int("he_elevation_ft"),
      real("he_heading_degT"),
      int("he_displaced_threshold_ft"),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "airport_frequencies",
    order: "id",
    indexes: ["airport_ref"],
    foreignKeys: [{ columns: ["airport_ref", "airport_ident"], table: "airports", refColumns: ["id", "ident"] }],
    columns: [
      int("id", pk),
      int("airport_ref", req),
      text("airport_ident", req),
      text("type", req),
      text("description"),
      real("frequency_mhz", req),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "navaids",
    order: "id",
    indexes: ["iso_country", "associated_airport"],
    columns: [
      int("id", pk),
      text("filename", req),
      text("ident", req),
      text("name", req),
      text("type", req),
      int("frequency_khz", req),
      real("latitude_deg", req),
      real("longitude_deg", req),
      int("elevation_ft"),
      text("iso_country", { ...req, ...ref("countries", "code") }),
      int("dme_frequency_khz"),
      text("dme_channel"),
      real("dme_latitude_deg"),
      real("dme_longitude_deg"),
      int("dme_elevation_ft"),
      real("slaved_variation_deg"),
      real("magnetic_variation_deg"),
      text("usage_type"),
      text("power"),
      text("associated_airport", ref("airports", "ident")),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "airlines",
    order: "id",
    indexes: ["data_version_id"],
    columns: [
      int("id", pk),
      text("ident", { ...req, ...uniq }),
      text("name", req),
      text("iata"),
      text("icao"),
      text("callsign"),
      text("country"),
      text("country_code", req),
      int("active", req),
      int("major", req),
      int("is_sample", req),
      int("data_version_id", ref("data_versions")),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "aircraft_types",
    order: "id",
    indexes: ["data_version_id"],
    columns: [
      int("id", pk),
      text("ident", { ...req, ...uniq }),
      text("icao"),
      text("iata"),
      text("family"),
      text("name", req),
      text("short_name"),
      text("alternate_names", req),
      text("manufacturer", req),
      int("engine_count"),
      text("engine_type"),
      text("aircraft_type"),
      int("in_production", req),
      text("status"),
      int("major", req),
      int("cargo", req),
      int("military", req),
      text("wiki_link"),
      int("is_primary", req),
      text("wake_category"),
      int("is_sample", req),
      int("data_version_id", ref("data_versions")),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "airline_hubs",
    order: "airline_id,airport_id",
    primaryKey: ["airline_id", "airport_id"],
    indexes: ["airport_id"],
    columns: [
      int("airline_id", { ...req, ...ref("airlines") }),
      int("airport_id", { ...req, ...ref("airports") }),
      int("is_primary", req),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
  {
    name: "airline_fleet",
    order: "airline_id,aircraft_type_id",
    primaryKey: ["airline_id", "aircraft_type_id"],
    indexes: ["aircraft_type_id"],
    columns: [
      int("airline_id", { ...req, ...ref("airlines") }),
      int("aircraft_type_id", { ...req, ...ref("aircraft_types") }),
      int("count"),
      text("updated_at", req),
      int("row_version", req),
    ],
  },
];

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function toSqliteValue(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function createSql(table: SqliteTable): string {
  const cols = table.columns.map((col) => {
    const parts = [quote(col.name), col.type];
    if (col.primaryKey) parts.push("PRIMARY KEY");
    if (col.notNull && !col.primaryKey) parts.push("NOT NULL");
    if (col.unique) parts.push("UNIQUE");
    return parts.join(" ");
  });
  const extras: string[] = [];
  if (table.primaryKey) extras.push(`PRIMARY KEY (${table.primaryKey.map(quote).join(", ")})`);
  for (const cols of table.unique ?? []) extras.push(`UNIQUE (${cols.map(quote).join(", ")})`);
  for (const col of table.columns) {
    if (col.references) extras.push(`FOREIGN KEY (${quote(col.name)}) REFERENCES ${quote(col.references.table)} (${quote(col.references.column)})`);
  }
  for (const fk of table.foreignKeys ?? []) {
    extras.push(`FOREIGN KEY (${fk.columns.map(quote).join(", ")}) REFERENCES ${quote(fk.table)} (${fk.refColumns.map(quote).join(", ")})`);
  }
  return `CREATE TABLE ${quote(table.name)} (${[...cols, ...extras].join(", ")})`;
}

export interface SqliteDumpMeta {
  api_version: string;
  data_version: string;
  generated_at: string;
}

export type SqliteRows = Record<string, Record<string, unknown>[]>;

/** Write a sqlite dump. Foreign keys are declared and not enforced while loading. Returns the data row count. */
export function writeSqliteDump(sqlitePath: string, rows: SqliteRows, meta: SqliteDumpMeta): number {
  const tmp = `${sqlitePath}.tmp`;
  rmSync(tmp, { force: true });
  const db = new Database(tmp);
  let total = 0;
  try {
    db.pragma("foreign_keys = OFF");
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    const insertMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    db.transaction(() => {
      for (const table of SQLITE_TABLES) {
        db.exec(createSql(table));
        for (const column of table.indexes) {
          db.exec(`CREATE INDEX ${quote(`${table.name}_${column}_idx`)} ON ${quote(table.name)} (${quote(column)})`);
        }
        const tableRows = rows[table.name] ?? [];
        const placeholders = table.columns.map(() => "?").join(", ");
        const insert = db.prepare(`INSERT INTO ${quote(table.name)} VALUES (${placeholders})`);
        for (const row of tableRows) insert.run(table.columns.map((col) => toSqliteValue(row[col.name])));
        total += tableRows.length;
      }
      insertMeta.run("api_version", meta.api_version);
      insertMeta.run("data_version", meta.data_version);
      insertMeta.run("generated_at", meta.generated_at);
      insertMeta.run("rows", String(total));
    })();
  } catch (err) {
    db.close();
    rmSync(tmp, { force: true });
    throw err;
  }
  db.close();
  renameSync(tmp, sqlitePath);
  return total;
}

export function readSqliteMeta(sqlitePath: string): Record<string, string> {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const rows = db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } finally {
    db.close();
  }
}

export function sqliteFileStats(sqlitePath: string): { bytes: number; sha256: string; rows: number } {
  const buf = readFileSync(sqlitePath);
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const meta = Object.fromEntries((db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[]).map((row) => [row.key, row.value]));
    let rows = meta.rows != null ? Number(meta.rows) : NaN;
    if (Number.isNaN(rows)) {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'meta'").all() as { name: string }[];
      rows = tables.reduce((sum, table) => sum + (db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table.name)}`).get() as { n: number }).n, 0);
    }
    return { bytes: statSync(sqlitePath).size, sha256: createHash("sha256").update(buf).digest("hex"), rows };
  } finally {
    db.close();
  }
}
