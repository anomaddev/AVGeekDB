import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const KEY_PREFIX = "avg_";
/** Dev-only key accepted when AVGEEKDB_MOCK is on. Never valid in production. */
export const DEMO_KEY = "avg_demo_0000000000000000000000000000";

/** Generate a new key. Return plaintext ONCE to the user; store only hash + prefix. */
export function generateApiKey(): { key: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: keyPrefix(key) };
}

export function hashApiKey(key: string, pepper = process.env.API_KEY_PEPPER ?? ""): string {
  return createHash("sha256").update(pepper + key).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface KeyRecord { id: string; user_id: string; revoked_at: string | null }
/** Display/lookup prefix stored with each key (`api_keys.prefix`, indexed). */
export const keyPrefix = (key: string) => key.slice(0, 12);
export interface KeyStore {
  findByHash(hash: string): Promise<KeyRecord | null>;
  /** Optional indexed lookup by stored prefix; verifyApiKey then compares hashes in constant time. */
  findByPrefix?(prefix: string): Promise<(KeyRecord & { key_hash: string })[]>;
  recordUsage(keyId: string, endpoint: string, status: number): Promise<void>;
}

/** In-memory store used in mock mode / tests. */
export class MemoryKeyStore implements KeyStore {
  usage: { keyId: string; endpoint: string; status: number }[] = [];
  constructor(private keys = new Map<string, KeyRecord>()) {}
  add(hash: string, rec: KeyRecord) { this.keys.set(hash, rec); }
  async findByHash(hash: string) { return this.keys.get(hash) ?? null; }
  async recordUsage(keyId: string, endpoint: string, status: number) { this.usage.push({ keyId, endpoint, status }); }
}

export type AuthResult = { ok: true; keyId: string } | { ok: false; status: 401 | 403; error: string };

export async function verifyApiKey(key: string | null, store: KeyStore): Promise<AuthResult> {
  if (!key) return { ok: false, status: 401, error: "Missing x-api-key header" };
  if (!key.startsWith(KEY_PREFIX)) return { ok: false, status: 401, error: "Malformed API key" };
  const hash = hashApiKey(key);
  let rec: KeyRecord | null;
  if (store.findByPrefix) {
    const hit = (await store.findByPrefix(keyPrefix(key))).find((c) => safeEqualHex(c.key_hash, hash));
    rec = hit ? { id: hit.id, user_id: hit.user_id, revoked_at: hit.revoked_at } : null;
  } else rec = await store.findByHash(hash);
  if (!rec) return { ok: false, status: 401, error: "Invalid API key" };
  if (rec.revoked_at) return { ok: false, status: 403, error: "API key revoked" };
  return { ok: true, keyId: rec.id };
}
