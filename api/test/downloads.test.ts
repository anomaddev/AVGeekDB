import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { buildArtifacts, publishRepoDownloads } from "../../scripts/build-artifacts";
import { downloadFormat, sortDownloads } from "../../web/lib/downloads";

describe("download artifacts", () => {
  it("writes csv, json, and sqlite for every dataset", () => {
    const dir = mkdtempSync(join(tmpdir(), "avgeekdb-"));
    try {
      const manifest = buildArtifacts(dir, new Date("2026-10-24T16:00:00Z"));
      expect(new Set(manifest.files.map((file) => file.format))).toEqual(new Set(["csv", "json", "sqlite"]));
      expect(manifest.files.filter((file) => file.format === "sqlite")).toHaveLength(1);
      for (const entity of ["airports", "airlines", "aircraft_types", "airline_hubs"]) {
        expect(manifest.files.some((file) => file.format === "csv" && file.dataset === entity && file.rows > 0)).toBe(true);
        expect(manifest.files.some((file) => file.format === "json" && file.dataset === entity && file.rows > 0)).toBe(true);
        const csv = readFileSync(join(dir, "csv", `${entity}.csv`), "utf8");
        expect(csv.startsWith(`# avgeekdb data_version=${manifest.data_version}\n`)).toBe(true);
        const json = JSON.parse(readFileSync(join(dir, "json", `${entity}.json`), "utf8")) as { data_version: string; data: unknown[] };
        expect(json.data_version).toBe(manifest.data_version);
        expect(json.data.length).toBeGreaterThan(0);
      }
      const airports = JSON.parse(readFileSync(join(dir, "json", "airports.json"), "utf8")) as { data: { scheduled_service: boolean }[] };
      expect(airports.data[0].scheduled_service).toBe(true);
      const types = JSON.parse(readFileSync(join(dir, "json", "aircraft_types.json"), "utf8")) as { data: { ident: string; alternate_names: string[] }[] };
      expect(types.data.find((row) => row.ident === "B77W")?.alternate_names).toEqual(["777-300ER", "Triple Seven"]);

      const db = new Database(join(dir, "avgeekdb.sqlite"), { readonly: true });
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
      expect(tables).toEqual(["aircraft_types", "airline_hubs", "airlines", "airports", "meta"]);
      expect((db.prepare("SELECT value FROM meta WHERE key = 'data_version'").get() as { value: string }).value).toBe(manifest.data_version);
      expect((db.prepare("SELECT COUNT(*) AS n FROM airports").get() as { n: number }).n).toBe(airports.data.length);
      const b77w = db.prepare("SELECT alternate_names, is_primary FROM aircraft_types WHERE ident = 'B77W'").get() as { alternate_names: string; is_primary: number };
      expect(b77w).toEqual({ alternate_names: "777-300ER,Triple Seven", is_primary: 1 });
      db.close();

      const sqlite = manifest.files.find((file) => file.format === "sqlite");
      expect(sqlite?.rows).toBe(manifest.files.filter((file) => file.format === "json").reduce((sum, file) => sum + file.rows, 0));
      expect(manifest.sample).toBe(true);
      expect(manifest.generated_at).toBe("2026-10-24T16:00:00.000Z");

      const dataDir = mkdtempSync(join(tmpdir(), "avgeekdb-data-"));
      try {
        const written = publishRepoDownloads(dir, dataDir);
        expect(written).toEqual([
          join("airports", "airports.json"),
          join("airlines", "airlines.json"),
          join("aircraft_types", "aircraft_types.json"),
          join("airline_hubs", "airline_hubs.json"),
          "avgeekdb.sqlite",
        ]);
        const published = JSON.parse(readFileSync(join(dataDir, "airports", "airports.json"), "utf8")) as { data: unknown[] };
        expect(published.data).toHaveLength(airports.data.length);
        const publishedDb = new Database(join(dataDir, "avgeekdb.sqlite"), { readonly: true });
        expect((publishedDb.prepare("SELECT COUNT(*) AS n FROM airlines").get() as { n: number }).n).toBeGreaterThan(0);
        publishedDb.close();
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("download classification", () => {
  it("infers format from older manifests that only stored a path", () => {
    const files = [
      { path: "csv/airline_hubs.csv", bytes: 1, sha256: "a" },
      { path: "json/airports.json", bytes: 1, sha256: "b" },
      { path: "avgeekdb.sqlite", bytes: 1, sha256: "c" },
      { path: "manifest.json", bytes: 1, sha256: "d" },
      { path: "csv/airports.csv", bytes: 1, sha256: "e" },
      { path: "csv/aircraft_types.csv", bytes: 1, sha256: "f" },
    ];
    expect(files.map(downloadFormat)).toEqual(["csv", "json", "sqlite", null, "csv", "csv"]);
    expect(sortDownloads(files.filter((file) => downloadFormat(file) === "csv")).map((file) => file.path)).toEqual([
      "csv/airports.csv",
      "csv/aircraft_types.csv",
      "csv/airline_hubs.csv",
    ]);
  });
});
