import type { Row } from "./types";

/** One related row, from a CSV record or a PostgREST object. */
export type DocRow = Record<string, unknown>;

export interface AirportRelations {
  countries: Map<string, DocRow>;
  regions: Map<string, DocRow>;
  runways: Map<string, DocRow[]>;
  freqs: Map<string, DocRow[]>;
  navaids: Map<string, DocRow[]>;
}

const COUNTRY_TEXT = ["id", "code", "name", "continent", "wikipedia_link", "keywords"] as const;
const REGION_TEXT = ["id", "code", "local_code", "name", "continent", "iso_country", "wikipedia_link", "keywords"] as const;
const RUNWAY_TEXT = [
  "id", "airport_ref", "airport_ident", "length_ft", "width_ft", "surface", "le_ident", "le_latitude_deg", "le_longitude_deg",
  "le_elevation_ft", "le_displaced_threshold_ft", "he_ident", "he_latitude_deg", "he_longitude_deg", "he_elevation_ft", "he_displaced_threshold_ft",
] as const;
const FREQ_TEXT = ["id", "airport_ref", "airport_ident", "type", "description", "frequency_mhz"] as const;
const NAVAID_TEXT = [
  "id", "filename", "ident", "name", "type", "frequency_khz", "latitude_deg", "longitude_deg", "elevation_ft", "iso_country",
  "dme_frequency_khz", "dme_channel", "dme_latitude_deg", "dme_longitude_deg", "dme_elevation_ft", "slaved_variation_deg",
  "magnetic_variation_deg", "power", "associated_airport",
] as const;

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Decimal string. Integers stay without a fraction; missing values are "". */
function numText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

/** Runway lighted/closed as "1" or "0". */
function flag(value: unknown): string {
  if (value == null || value === "") return "";
  if (value === true || value === 1 || value === "1") return "1";
  if (value === false || value === 0 || value === "0") return "0";
  const t = String(value).trim().toLowerCase();
  if (t === "true" || t === "yes") return "1";
  if (t === "false" || t === "no") return "0";
  return t;
}

export function scheduledService(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const t = String(value ?? "").trim().toLowerCase();
  return t === "true" || t === "yes" || t === "1";
}

function field(row: DocRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function byId(a: DocRow, b: DocRow): number {
  return Number(a.id) - Number(b.id);
}

function bucket(rows: DocRow[], keyOf: (row: DocRow) => string): Map<string, DocRow[]> {
  const map = new Map<string, DocRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  for (const list of map.values()) list.sort(byId);
  return map;
}

/** Index one page of related rows. Arrays are ordered by id. */
export function indexRelations(input: {
  countries: DocRow[];
  regions: DocRow[];
  runways: DocRow[];
  freqs: DocRow[];
  navaids: DocRow[];
}): AirportRelations {
  const countries = new Map<string, DocRow>();
  for (const row of input.countries) {
    const code = text(row.code);
    if (code) countries.set(code, row);
  }
  const regions = new Map<string, DocRow>();
  for (const row of input.regions) {
    const code = text(row.code);
    if (code) regions.set(code, row);
  }
  return {
    countries,
    regions,
    runways: bucket(input.runways, (row) => text(row.airport_ref)),
    freqs: bucket(input.freqs, (row) => text(row.airport_ref)),
    navaids: bucket(input.navaids, (row) => text(row.associated_airport)),
  };
}

function nested(row: DocRow | undefined, keys: readonly string[], fallback: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = numText(row ? field(row, key) : fallback[key]);
  return out;
}

function runwayDoc(row: DocRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of RUNWAY_TEXT) {
    if (key === "le_displaced_threshold_ft") out.le_heading_degT = numText(field(row, "le_heading_degT", "le_heading_degt"));
    if (key === "he_displaced_threshold_ft") out.he_heading_degT = numText(field(row, "he_heading_degT", "he_heading_degt"));
    out[key] = numText(row[key]);
    if (key === "surface") {
      out.lighted = flag(row.lighted);
      out.closed = flag(row.closed);
    }
  }
  return out;
}

function navaidDoc(row: DocRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of NAVAID_TEXT) {
    if (key === "power") out.usageType = text(field(row, "usageType", "usage_type"));
    out[key] = numText(row[key]);
  }
  return out;
}

/** One airport in the airportdb.io document shape. `scheduled_service` stays boolean. */
export function formatAirport(row: DocRow, relations: AirportRelations): Row {
  const isoCountry = text(field(row, "iso_country", "country"));
  const isoRegion = text(field(row, "iso_region"));
  const ident = text(row.ident);
  const id = text(row.id);
  const country = relations.countries.get(isoCountry);
  const region = relations.regions.get(isoRegion);
  const doc: Record<string, unknown> = {
    ident,
    type: text(row.type),
    name: text(row.name),
    latitude_deg: numText(field(row, "latitude_deg", "latitude")),
    longitude_deg: numText(field(row, "longitude_deg", "longitude")),
    elevation_ft: numText(row.elevation_ft),
    continent: text(row.continent),
    iso_country: isoCountry,
    iso_region: isoRegion,
    municipality: text(row.municipality),
    scheduled_service: scheduledService(row.scheduled_service),
    gps_code: text(row.gps_code),
    iata_code: text(field(row, "iata_code", "iata")),
    local_code: text(row.local_code),
    home_link: text(row.home_link),
    wikipedia_link: text(row.wikipedia_link),
    keywords: text(row.keywords),
    icao_code: text(field(row, "icao_code", "icao")),
    runways: (relations.runways.get(id) ?? []).map(runwayDoc),
    freqs: (relations.freqs.get(id) ?? []).map((freq) => {
      const out: Record<string, string> = {};
      for (const key of FREQ_TEXT) out[key] = numText(freq[key]);
      return out;
    }),
    country: nested(country, COUNTRY_TEXT, { code: isoCountry }),
    region: nested(region, REGION_TEXT, { code: isoRegion }),
    navaids: (relations.navaids.get(ident) ?? []).map(navaidDoc),
  };
  return doc as Row;
}

export function formatAirports(rows: DocRow[], relations: AirportRelations): Row[] {
  return rows.map((row) => formatAirport(row, relations));
}
