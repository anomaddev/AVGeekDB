import { describe, it, expect } from "vitest";
import { handleEntityRequest, MemoryKeyStore, RateLimiter, csvDataSource, hashApiKey, generateApiKey, queryRows, loadEntity } from "../src";

function deps(limit = 5) {
  const store = new MemoryKeyStore();
  const { key } = generateApiKey();
  store.add(hashApiKey(key), { id: "k1", user_id: "u1", revoked_at: null });
  const revoked = generateApiKey().key;
  store.add(hashApiKey(revoked), { id: "k2", user_id: "u1", revoked_at: "2026-01-01" });
  return { key, revoked, d: { store, limiter: new RateLimiter(limit), source: csvDataSource } };
}
const req = (path: string, key?: string) => new Request(`http://x${path}`, { headers: key ? { "x-api-key": key } : {} });

describe("api", () => {
  it("loads sample data marked as sample", () => {
    for (const e of ["airports", "airlines", "aircraft_types"] as const) {
      const rows = loadEntity(e);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.is_sample === true)).toBe(true);
    }
  });
  it("requires a key and rejects revoked keys", async () => {
    const { key, revoked, d } = deps();
    expect((await handleEntityRequest("airports", req("/"), d)).status).toBe(401);
    expect((await handleEntityRequest("airports", req("/", "avg_nope"), d)).status).toBe(401);
    for (const r of [await handleEntityRequest("airports", req("/"), d), await handleEntityRequest("airports", req("/", revoked), d), await handleEntityRequest("airports", req("/?limit=0", key), d)]) {
      expect([401, 403, 400]).toContain(r.status);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
    expect((await handleEntityRequest("airports", req("/", revoked), d)).status).toBe(403);
  });
  it("searches, filters, paginates", async () => {
    const { key, d } = deps();
    const r = await handleEntityRequest("airports", req("/?q=heathrow", key), d);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-data-version")).toBe("2026.10.23-sample");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBeNull();
    const body = await r.json();
    expect(body.data[0].iata).toBe("LHR");
    expect(body.meta.data_version).toBe("2026.10.23-sample");
    expect(body.data[0]).toMatchObject({ municipality: "London", continent: "EU", iso_region: "GB-ENG", scheduled_service: true });
    expect(body.data[0]).not.toHaveProperty("city");
    const us = queryRows("airports", loadEntity("airports"), new URLSearchParams("country=US&type=large_airport&scheduled_service=true"));
    expect(us.data.map((a) => a.icao)).toEqual(["KJFK"]);
    expect(queryRows("airports", loadEntity("airports"), new URLSearchParams("q=tokyo")).data[0].icao).toBe("RJTT");
    const p = queryRows("airlines", loadEntity("airlines"), new URLSearchParams("limit=2"));
    expect(p.data).toHaveLength(2); expect(p.meta.next_offset).toBe(2);
    const ba = queryRows("airlines", loadEntity("airlines"), new URLSearchParams("iata=BA")).data[0];
    expect(ba.hubs).toEqual(["EGLL"]);
    expect(ba).not.toHaveProperty("hub_icao");
    expect(queryRows("airlines", loadEntity("airlines"), new URLSearchParams("hub=rjtt")).data.map((r) => r.iata)).toEqual(["NH"]);
    expect(queryRows("aircraft_types", loadEntity("aircraft_types"), new URLSearchParams("manufacturer=airbus")).meta.total).toBe(1);
    const b77w = queryRows("aircraft_types", loadEntity("aircraft_types"), new URLSearchParams("icao=B77W")).data[0];
    expect(b77w.alternate_names).toEqual(["777-300ER", "Triple Seven"]);
    expect(b77w.is_primary).toBe(true);
    expect(queryRows("aircraft_types", loadEntity("aircraft_types"), new URLSearchParams("q=triple")).data.map((r) => r.ident)).toEqual(["B77W"]);
    expect(queryRows("airlines", loadEntity("airlines"), new URLSearchParams("country_code=jp")).data.map((r) => r.ident)).toEqual(["ANA"]);
    expect(ba.major).toBe(true);
    expect((await handleEntityRequest("airports", req("/?limit=1000", key), d)).status).toBe(400);
  });
  it("rate limits per key and records usage", async () => {
    const { key, d } = deps(2);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handleEntityRequest("airlines", req("/", key), d)).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect(d.store.usage).toHaveLength(3);
  });
});

describe("pushdown sources", () => {
  it("uses source.query when present and never queries for malformed keys", async () => {
    const { key, d } = deps();
    const calls: string[] = [];
    const source = { ...d.source, async query(e: any, p: URLSearchParams) { calls.push(`${e}?${p}`); return { data: [], meta: { total: 0, limit: 25, offset: 0, next_offset: null } }; } };
    const ok = await handleEntityRequest("airports", req("/?icao=KJFK", key), { ...d, source });
    expect(ok.status).toBe(200);
    expect(calls).toEqual(["airports?icao=KJFK"]);
    expect((await handleEntityRequest("airports", req("/", "nope"), { ...d, source })).status).toBe(401);
    expect(calls).toHaveLength(1);
  });
});
