/**
 * Upsert the real source files into Supabase reference tables (on `ident`):
 *   data/airlines/airlines_full.csv  -> public.airlines
 *   data/aircraft_types/aircraft.csv -> public.aircraft_types
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY (or AVGEEKDB_SUPABASE_SERVICE_ROLE_KEY).
 * Rows go through PostgREST, so the row-level audit trigger (change_log) and bump_row_version trigger fire as normal.
 * Note: bump_row_version sets updated_at = now() on UPDATE, so re-imports of existing rows get a fresh updated_at;
 * first-time inserts keep the file's updated_at.
 * --dry-run parses and validates without writing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.AVGEEKDB_SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const BATCH = 500;
if (!dryRun && (!url || !key)) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }

type Val = string | number | boolean | null | string[];
const str = (v: string) => (v.trim() === "" ? null : v.trim());
const bool = (v: string) => { const t = v.trim().toUpperCase(); if (t === "") return null; if (t === "TRUE") return true; if (t === "FALSE") return false; throw new Error(`bad boolean "${v}"`); };
const int = (v: string) => { if (v.trim() === "") return null; const n = Number(v); if (!Number.isInteger(n)) throw new Error(`bad integer "${v}"`); return n; };
const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

interface Spec { table: string; file: string; map: (r: Record<string, string>) => Record<string, Val> }
const SPECS: Spec[] = [
  {
    table: "airlines", file: "data/airlines/airlines_full.csv",
    map: (r) => ({
      ident: str(r.ident), name: str(r.name), iata: str(r.iata), icao: str(r.icao), callsign: str(r.callsign),
      country: str(r.country), country_code: str(r.country_code), active: bool(r.active) ?? false, major: bool(r.major) ?? false,
      updated_at: str(r.updated_at), is_sample: false,
    }),
  },
  {
    table: "aircraft_types", file: "data/aircraft_types/aircraft.csv",
    map: (r) => ({
      ident: str(r.ident), icao: str(r.icao), iata: str(r.iata), family: str(r.family), name: str(r.name), short_name: str(r.short_name),
      alternate_names: list(r.alternate_names), manufacturer: str(r.manufacturer), engine_count: int(r.engine_count),
      engine_type: str(r.engine_type), aircraft_type: str(r.aircraft_type), in_production: bool(r.in_production) ?? false,
      status: str(r.status), major: bool(r.major) ?? false, cargo: bool(r.cargo) ?? false, military: bool(r.military) ?? false,
      wiki_link: str(r.wiki_link), updated_at: str(r.updated_at), is_primary: bool(r.primary) ?? false, is_sample: false,
    }),
  },
];

async function upsert(table: string, rows: Record<string, Val>[]): Promise<string | null> {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=ident`, {
    method: "POST",
    headers: { apikey: key!, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return res.ok ? null : `${res.status} ${await res.text()}`;
}

async function count(table: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&is_sample=eq.false`, { method: "HEAD", headers: { apikey: key!, authorization: `Bearer ${key}`, prefer: "count=exact", range: "0-0" } });
  return Number(res.headers.get("content-range")?.split("/")[1] ?? NaN);
}

async function main() {
let failed = false;
for (const spec of SPECS) {
  const raw = parse(readFileSync(join(process.cwd(), spec.file), "utf8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const rows: Record<string, Val>[] = [];
  const rejected: string[] = [];
  raw.forEach((r, i) => { try { const m = spec.map(r); if (!m.ident) throw new Error("missing ident"); rows.push(m); } catch (e) { rejected.push(`line ${i + 2} (${r.ident}): ${(e as Error).message}`); } });
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const err = await upsert(spec.table, batch);
      if (!err) continue;
      // Retry row by row so one bad row does not reject the whole batch.
      for (const row of batch) { const e = await upsert(spec.table, [row]); if (e) rejected.push(`${row.ident}: ${e}`); }
    }
  }
  const total = dryRun ? NaN : await count(spec.table);
  console.log(`${spec.table}: file=${raw.length} sent=${rows.length} rejected=${rejected.length}${dryRun ? "" : ` table(non-sample)=${total}`}`);
  for (const r of rejected) console.log(`  rejected ${r}`);
  if (rejected.length || (!dryRun && total !== raw.length)) failed = true;
}
process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
