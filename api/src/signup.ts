import type { SupabaseClient } from "@supabase/supabase-js";
import { generateApiKey, hashApiKey } from "./keys";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const MAX_ACTIVE_KEYS_PER_EMAIL = 3;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fetch = typeof fetch;

/** Server-side Turnstile check. Never trust the widget alone. */
export async function verifyTurnstile(token: string, opts: { secret?: string; ip?: string | null; fetchImpl?: Fetch } = {}): Promise<boolean> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (opts.ip) body.set("remoteip", opts.ip);
  try {
    const res = await (opts.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/** Storage used by key sign-up. Only the hash and display prefix are ever stored. */
export interface SignupStore {
  findOrCreateUser(email: string, name: string): Promise<string>;
  countActiveKeys(userId: string): Promise<number>;
  insertKey(row: { user_id: string; name: string; prefix: string; key_hash: string }): Promise<void>;
}

export type SignupResult = { ok: true; key: string } | { ok: false; status: 400 | 403 | 429 | 500; error: string };

export interface SignupInput { email: unknown; name: unknown; token: unknown; ip?: string | null }

/** Validate input, verify Turnstile, then issue one avg_ key and return its plaintext exactly once. */
export async function issueSignupKey(input: SignupInput, deps: { store: SignupStore; verify?: (token: string, ip?: string | null) => Promise<boolean>; pepper?: string }): Promise<SignupResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const token = String(input.token ?? "");
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, status: 400, error: "Enter a valid email address." };
  if (!name || name.length > 80) return { ok: false, status: 400, error: "Enter a name of 1-80 characters." };
  if (!token) return { ok: false, status: 400, error: "Complete the verification challenge." };
  const verify = deps.verify ?? ((t, ip) => verifyTurnstile(t, { ip }));
  if (!(await verify(token, input.ip))) return { ok: false, status: 403, error: "Verification failed. Please try again." };
  try {
    const userId = await deps.store.findOrCreateUser(email, name);
    if ((await deps.store.countActiveKeys(userId)) >= MAX_ACTIVE_KEYS_PER_EMAIL) return { ok: false, status: 429, error: "This email already has the maximum number of active keys." };
    const { key, prefix } = generateApiKey();
    await deps.store.insertKey({ user_id: userId, name, prefix, key_hash: hashApiKey(key, deps.pepper) });
    return { ok: true, key };
  } catch (e) {
    console.error("signup key issue failed", e instanceof Error ? e.message : "unknown");
    return { ok: false, status: 500, error: "Could not create the API key." };
  }
}

/** Supabase-backed store (service role). Creates a confirmed-less auth user for new emails. */
export class SupabaseSignupStore implements SignupStore {
  constructor(private client: SupabaseClient) {}

  async findOrCreateUser(email: string, name: string): Promise<string> {
    const created = await this.client.auth.admin.createUser({ email, user_metadata: { name, source: "api-key-signup" } });
    if (created.data.user) return created.data.user.id;
    // Already registered: find it. Paged scan is fine at current user counts.
    for (let page = 1; page < 100; page++) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`user lookup failed: ${error.message}`);
      const hit = data.users.find((u) => u.email?.toLowerCase() === email);
      if (hit) return hit.id;
      if (data.users.length < 1000) break;
    }
    throw new Error(`user create failed: ${created.error?.message ?? "unknown"}`);
  }

  async countActiveKeys(userId: string): Promise<number> {
    const { count, error } = await this.client.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", userId).is("revoked_at", null);
    if (error) throw new Error(`key count failed: ${error.message}`);
    return count ?? 0;
  }

  async insertKey(row: { user_id: string; name: string; prefix: string; key_hash: string }): Promise<void> {
    const { error } = await this.client.from("api_keys").insert(row);
    if (error) throw new Error(`key insert failed: ${error.code}`);
  }
}
