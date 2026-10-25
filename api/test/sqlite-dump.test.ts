import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { EXCLUDED_TABLES, SQLITE_TABLES, readSqliteMeta, writeSqliteDump } from "../../scripts/sqlite-dump";

describe("supabase sqlite dump", () => {
  it("dumps the reference tables and leaves out secret tables", () => {
    expect(SQLITE_TABLES.map((table) => table.name)).toEqual([
      "data_versions",
      "countries",
      "regions",
      "airports",
      "runways",
      "airport_frequencies",
      "navaids",
      "airlines",
      "aircraft_types",
      "airline_hubs",
      "airline_fleet",
    ]);
    const names = new Set(SQLITE_TABLES.map((table) => table.name));
    for (const excluded of EXCLUDED_TABLES) expect(names.has(excluded)).toBe(false);
    expect(SQLITE_TABLES.findIndex((table) => table.name === "data_versions"))
      .toBeLessThan(SQLITE_TABLES.findIndex((table) => table.name === "airports"));

    const dir = mkdtempSync(join(tmpdir(), "avgeekdb-sqlite-"));
    const dest = join(dir, "avgeekdb.sqlite");
    try {
      writeSqliteDump(dest, {
        countries: [{ id: 1, code: "US", name: "United States", continent: "NA", updated_at: "2026-10-25T00:00:00.000Z", row_version: 1 }],
        airports: [{
          id: 10, ident: "KJFK", type: "large_airport", name: "John F Kennedy",
          latitude_deg: 40.64, longitude_deg: -73.78, continent: "NA", iso_country: "US", iso_region: "US-NY",
          municipality: "New York", scheduled_service: true, icao_code: "KJFK", iata_code: "JFK",
          is_sample: false, updated_at: "2026-10-25T00:00:00.000Z", row_version: 1,
        }],
        aircraft_types: [{
          id: 7, ident: "B77W", name: "777-300ER", manufacturer: "Boeing",
          alternate_names: ["777-300ER", "Triple Seven"], in_production: true, major: true,
          cargo: false, military: false, is_primary: true, is_sample: false,
          updated_at: "2026-10-25T00:00:00.000Z", row_version: 1,
        }],
      }, { api_version: "0.1.0", data_version: "2026.10.25", generated_at: "2026-10-25T06:00:00.000Z" });

      const db = new Database(dest, { readonly: true });
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'meta' ORDER BY name").all() as { name: string }[])
        .map((row) => row.name);
      expect(tables).toEqual([...names].sort());
      const airportCols = (db.prepare("PRAGMA table_info(airports)").all() as { name: string }[]).map((col) => col.name);
      expect(airportCols).toEqual(expect.arrayContaining(["iso_country", "iata_code", "icao_code", "latitude_deg", "longitude_deg"]));
      expect(airportCols).not.toContain("iata");
      expect(airportCols).not.toContain("country");
      const airport = db.prepare("SELECT iso_country, iata_code, latitude_deg, scheduled_service FROM airports WHERE ident = 'KJFK'").get() as {
        iso_country: string; iata_code: string; latitude_deg: number; scheduled_service: number;
      };
      expect(airport).toEqual({ iso_country: "US", iata_code: "JFK", latitude_deg: 40.64, scheduled_service: 1 });
      const aircraft = db.prepare("SELECT alternate_names FROM aircraft_types WHERE ident = 'B77W'").get() as { alternate_names: string };
      expect(aircraft.alternate_names).toBe("[\"777-300ER\",\"Triple Seven\"]");
      db.close();
      expect(readSqliteMeta(dest)).toEqual({
        api_version: "0.1.0",
        data_version: "2026.10.25",
        generated_at: "2026-10-25T06:00:00.000Z",
        rows: "3",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
