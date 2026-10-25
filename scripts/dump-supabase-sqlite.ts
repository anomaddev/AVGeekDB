/**
 * Dump the current Supabase reference tables into data/avgeekdb.sqlite.
 * Reads PostgREST with the service role. Does not read or write the CSV snapshots.
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
 * --dry-run prints row counts and writes nothing.
 */
import { join } from "node:path";
import { API_VERSION, findDataDir } from "../api/src";
import { EXCLUDED_TABLES, SQLITE_TABLES, writeSqliteDump, type SqliteRows } from "./sqlite-dump";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

type Row = Record<string, unknown>;

async function rest(path: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: key!,
        authorization: `Bearer ${key}`,
        range: `${from}-${from + 999}`,
      },
    });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const rows: SqliteRows = {};
for (const table of SQLITE_TABLES) {
  if ((EXCLUDED_TABLES as readonly string[]).includes(table.name)) throw new Error(`refusing to dump ${table.name}`);
  const select = table.columns.map((col) => col.name).join(",");
  rows[table.name] = await rest(`${table.name}?select=${encodeURIComponent(select)}&order=${table.order}`);
  console.log(`${table.name}: ${rows[table.name].length} rows`);
}

const current = rows.data_versions.find((row) => row.is_current === true);
const dataVersion = String(current?.version ?? "unversioned");
const generatedAt = new Date().toISOString();
console.log(`api_version: ${API_VERSION}`);
console.log(`data_version: ${dataVersion}`);

if (dryRun) {
  console.log("dry-run: wrote nothing");
} else {
  const dest = join(findDataDir(), "avgeekdb.sqlite");
  const total = writeSqliteDump(dest, rows, { api_version: API_VERSION, data_version: dataVersion, generated_at: generatedAt });
  console.log(`wrote ${dest} (${total} rows)`);
}
