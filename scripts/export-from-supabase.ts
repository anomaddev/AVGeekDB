/**
 * Export the current Supabase data (source of truth) into data/ as CSV, and set data/VERSION
 * to the current data_versions row. The SQLite download is a separate dump (`npm run data:sqlite`).
 * Env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY. Read-only against Supabase.
 * --dry-run prints row counts without writing.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "csv-stringify/sync";
import { findDataDir, type Dataset, type Row } from "../api/src";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }

async function rest(path: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// Column order must match schema/<dataset>.schema.json (and the CSV headers in data/).
const EXPORTS: Record<Dataset, { select: string; order: string; map?: (r: Record<string, unknown>) => Row }> = {
  airports: {
    select: "ident,iata_code,icao_code,name,municipality,iso_country,latitude_deg,longitude_deg,elevation_ft,type,continent,iso_region,scheduled_service,gps_code,local_code,home_link,wikipedia_link,keywords,is_sample",
    order: "ident",
    map: (r) => ({
      ident: r.ident as string, iata: r.iata_code as string | null, icao: r.icao_code as string | null, name: r.name as string,
      municipality: r.municipality as string | null, country: r.iso_country as string, latitude: r.latitude_deg as number, longitude: r.longitude_deg as number,
      elevation_ft: r.elevation_ft as number | null, type: r.type as string, continent: r.continent as string | null, iso_region: r.iso_region as string | null,
      scheduled_service: r.scheduled_service as boolean, gps_code: r.gps_code as string | null, local_code: r.local_code as string | null,
      home_link: r.home_link as string | null, wikipedia_link: r.wikipedia_link as string | null, keywords: r.keywords as string | null, is_sample: r.is_sample as boolean,
    }),
  },
  airlines: { select: "ident,name,iata,icao,callsign,country,country_code,active,major,is_sample", order: "ident" },
  aircraft_types: {
    select: "ident,icao,iata,family,name,short_name,alternate_names,manufacturer,engine_count,engine_type,aircraft_type,in_production,status,major,cargo,military,wiki_link,is_primary,wake_category,is_sample",
    order: "ident",
    map: (r) => ({ ...(r as Row), alternate_names: ((r.alternate_names as string[] | null) ?? []).join(",") }),
  },
  airline_hubs: {
    select: "is_primary,airline:airlines(icao,is_sample),airport:airports(icao_code)", order: "airline_id",
    map: (r) => {
      const al = r.airline as { icao: string; is_sample: boolean }, ap = r.airport as { icao_code: string };
      return { airline_icao: al.icao, airport_icao: ap.icao_code, is_primary: r.is_primary as boolean, is_sample: al.is_sample };
    },
  },
};

const dataDir = findDataDir();
for (const [ds, spec] of Object.entries(EXPORTS) as [Dataset, (typeof EXPORTS)[Dataset]][]) {
  const raw = await rest(`${ds}?select=${encodeURIComponent(spec.select)}&order=${spec.order}`);
  const rows = spec.map ? raw.map((r) => spec.map!(r as Record<string, unknown>)) : raw;
  console.log(`${ds}: ${rows.length} rows`);
  if (!dryRun) writeFileSync(join(dataDir, ds, `${ds}.csv`), stringify(rows, { header: true, cast: { boolean: (b) => String(b) } }));
}
const [current] = await rest("data_versions?select=version&is_current=eq.true");
const version = String(current?.version ?? new Date().toISOString().slice(0, 10).replaceAll("-", "."));
console.log(`data_version: ${version}`);
if (!dryRun) writeFileSync(join(dataDir, "VERSION"), version + "\n");
