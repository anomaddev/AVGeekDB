import { loadEntity, currentDataVersion } from "./dataset";
import { queryRows, QueryError } from "./query";
import { verifyApiKey, MemoryKeyStore, hashApiKey, DEMO_KEY, type KeyStore } from "./keys";
import { RateLimiter } from "./rateLimit";
import type { Entity, Row } from "./types";

export interface DataSource { rows(entity: Entity): Promise<Row[]>; version(): Promise<string> }

/** Mock source: bundled CSV sample data. TODO: SupabaseDataSource querying the airports/airlines/aircraft_types tables. */
export const csvDataSource: DataSource = { async rows(e) { return loadEntity(e); }, async version() { return currentDataVersion(); } };

export interface HandlerDeps { store: KeyStore; limiter: RateLimiter; source: DataSource }

export function isMock() { return (process.env.AVGEEKDB_MOCK ?? "true") !== "false"; }

let defaults: HandlerDeps | null = null;
export function defaultDeps(): HandlerDeps {
  if (defaults) return defaults;
  if (!isMock()) {
    // TODO: return { store: new SupabaseKeyStore(serviceClient), source: new SupabaseDataSource(...), ... }
    throw new Error("Supabase-backed KeyStore/DataSource not implemented yet; set AVGEEKDB_MOCK=true");
  }
  const store = new MemoryKeyStore();
  store.add(hashApiKey(DEMO_KEY), { id: "demo", user_id: "demo", revoked_at: null });
  defaults = { store, source: csvDataSource, limiter: new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60)) };
  return defaults;
}

const baseJson = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Framework-agnostic handler (Web Request -> Response). Next.js route handlers call this. */
export async function handleEntityRequest(entity: Entity, req: Request, deps: HandlerDeps = defaultDeps()): Promise<Response> {
  const version = await deps.source.version();
  const json = (body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) =>
    baseJson(body, status, { "x-data-version": version, ...headers });
  const auth = await verifyApiKey(req.headers.get("x-api-key"), deps.store);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const rl = deps.limiter.check(auth.keyId);
  const rlHeaders = { "x-ratelimit-limit": String(deps.limiter.limit), "x-ratelimit-remaining": String(rl.remaining), "x-ratelimit-reset": String(Math.ceil(rl.resetMs / 1000)) };
  const endpoint = `/v1/${entity.replace("_types", "")}`;
  if (!rl.allowed) { await deps.store.recordUsage(auth.keyId, endpoint, 429); return json({ error: "Rate limit exceeded" }, 429, { ...rlHeaders, "retry-after": rlHeaders["x-ratelimit-reset"] }); }
  try {
    const result = queryRows(entity, await deps.source.rows(entity), new URL(req.url).searchParams);
    await deps.store.recordUsage(auth.keyId, endpoint, 200);
    return json({ ...result, meta: { ...result.meta, data_version: version } }, 200, rlHeaders);
  } catch (e) {
    if (e instanceof QueryError) return json({ error: e.message }, 400, rlHeaders);
    throw e;
  }
}
