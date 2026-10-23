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
    const { revoked, d } = deps();
    expect((await handleEntityRequest("airports", req("/"), d)).status).toBe(401);
    expect((await handleEntityRequest("airports", req("/", "avg_nope"), d)).status).toBe(401);
    expect((await handleEntityRequest("airports", req("/", revoked), d)).status).toBe(403);
  });
  it("searches, filters, paginates", async () => {
    const { key, d } = deps();
    const r = await handleEntityRequest("airports", req("/?q=heathrow", key), d);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-data-version")).toBe("2026.10.23-sample");
    const body = await r.json();
    expect(body.data[0].iata).toBe("LHR");
    expect(body.meta.data_version).toBe("2026.10.23-sample");
    const p = queryRows("airlines", loadEntity("airlines"), new URLSearchParams("limit=2"));
    expect(p.data).toHaveLength(2); expect(p.meta.next_offset).toBe(2);
    expect(queryRows("aircraft_types", loadEntity("aircraft_types"), new URLSearchParams("manufacturer=airbus")).meta.total).toBe(1);
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
