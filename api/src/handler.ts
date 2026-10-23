import { loadEntity, currentDataVersion } from "./dataset";
import { queryRows, QueryError, type QueryResult } from "./query";
import { verifyApiKey, KEY_PREFIX, MemoryKeyStore, hashApiKey, DEMO_KEY, type KeyStore } from "./keys";
import { createServiceClient, SupabaseKeyStore, SupabaseDataSource } from "./supabase";
import { RateLimiter } from "./rateLimit";
import type { Entity, Row } from "./types";

/** `query`, when present, answers a request directly (live mode pushes it down to Postgres); otherwise rows() + queryRows() run in memory. */
export interface DataSource { rows(entity: Entity): Promise<Row[]>; version(): Promise<string>; query?(entity: Entity, params: URLSearchParams): Promise<QueryResult> }

/** Mock source: bundled CSV sample data. Live mode uses SupabaseDataSource. */
export const csvDataSource: DataSource = { async rows(e) { return loadEntity(e); }, async version() { return currentDataVersion(); } };

export interface HandlerDeps { store: KeyStore; limiter: RateLimiter; source: DataSource }

export function isMock() { return (process.env.AVGEEKDB_MOCK ?? "true") !== "false"; }

let defaults: HandlerDeps | null = null;
export function defaultDeps(): HandlerDeps {
  if (defaults) return defaults;
  const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60));
  if (!isMock()) {
    const client = createServiceClient();
    defaults = { store: new SupabaseKeyStore(client), source: new SupabaseDataSource(client), limiter };
    return defaults;
  }
  const store = new MemoryKeyStore();
  store.add(hashApiKey(DEMO_KEY), { id: "demo", user_id: "demo", revoked_at: null });
  defaults = { store, source: csvDataSource, limiter };
  return defaults;
}

/** Edge caching is on hold: every /v1 response is uncacheable. */
export const NO_STORE = { "cache-control": "private, no-store" };

/** Fire-and-forget: the response never waits on usage logging, and a failed write is logged, not thrown. */
function logUsage(store: KeyStore, keyId: string, endpoint: string, status: number): void {
  void store.recordUsage(keyId, endpoint, status).catch((e) => console.error(`usage log failed for ${endpoint}:`, e instanceof Error ? e.message : e));
}

const baseJson = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Framework-agnostic handler (Web Request -> Response). Next.js route handlers call this. */
export async function handleEntityRequest(entity: Entity, req: Request, deps: HandlerDeps = defaultDeps()): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const apiKey = req.headers.get("x-api-key");
  // Live mode: start the data query alongside the key lookup so a request costs one database round trip, not two.
  // Only for well-formed keys; the result is discarded unless the key checks out.
  const pending = deps.source.query && apiKey?.startsWith(KEY_PREFIX) ? deps.source.query(entity, params) : null;
  pending?.catch(() => {}); // surfaced below once auth passes
  const [version, auth] = await Promise.all([deps.source.version(), verifyApiKey(apiKey, deps.store)]);
  const json = (body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) =>
    baseJson(body, status, { "x-data-version": version, ...NO_STORE, ...headers });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const rl = deps.limiter.check(auth.keyId);
  const rlHeaders = { "x-ratelimit-limit": String(deps.limiter.limit), "x-ratelimit-remaining": String(rl.remaining), "x-ratelimit-reset": String(Math.ceil(rl.resetMs / 1000)) };
  const endpoint = `/v1/${entity.replace("_types", "")}`;
  if (!rl.allowed) { logUsage(deps.store, auth.keyId, endpoint, 429); return json({ error: "Rate limit exceeded" }, 429, { ...rlHeaders, "retry-after": rlHeaders["x-ratelimit-reset"] }); }
  try {
    const result = pending ? await pending : deps.source.query ? await deps.source.query(entity, params) : queryRows(entity, await deps.source.rows(entity), params);
    logUsage(deps.store, auth.keyId, endpoint, 200);
    return json({ ...result, meta: { ...result.meta, data_version: version } }, 200, rlHeaders);
  } catch (e) {
    if (e instanceof QueryError) return json({ error: e.message }, 400, rlHeaders);
    console.error(`${endpoint} failed:`, e instanceof Error ? e.message : e);
    return json({ error: "Internal error" }, 500, rlHeaders);
  }
}
