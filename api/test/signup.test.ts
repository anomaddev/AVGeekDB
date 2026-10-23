import { describe, it, expect } from "vitest";
import { issueSignupKey, verifyTurnstile, hashApiKey, TURNSTILE_VERIFY_URL, type SignupStore } from "../src";

function memStore(active = 0) {
  const keys: { user_id: string; name: string; prefix: string; key_hash: string }[] = [];
  const store: SignupStore = {
    async findOrCreateUser(email) { return `u:${email}`; },
    async countActiveKeys(id) { return active + keys.filter((k) => k.user_id === id).length; },
    async insertKey(row) { keys.push(row); },
  };
  return { store, keys };
}
const ok = async () => true;

describe("api key sign-up", () => {
  it("issues an avg_ key once and stores only its hash", async () => {
    const { store, keys } = memStore();
    const r = await issueSignupKey({ email: " Pilot@Example.com ", name: "My app", token: "t" }, { store, verify: ok, pepper: "p" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key).toMatch(/^avg_[A-Za-z0-9_-]{32}$/);
    expect(keys).toHaveLength(1);
    expect(keys[0].user_id).toBe("u:pilot@example.com");
    expect(keys[0].key_hash).toBe(hashApiKey(r.key, "p"));
    expect(JSON.stringify(keys)).not.toContain(r.key);
    expect(keys[0].prefix).toBe(r.key.slice(0, 12));
  });
  it("validates input and requires a passing Turnstile check", async () => {
    const { store, keys } = memStore();
    expect((await issueSignupKey({ email: "nope", name: "x", token: "t" }, { store, verify: ok })).ok).toBe(false);
    expect((await issueSignupKey({ email: "a@b.co", name: "", token: "t" }, { store, verify: ok })).ok).toBe(false);
    expect(await issueSignupKey({ email: "a@b.co", name: "x", token: "" }, { store, verify: ok })).toMatchObject({ status: 400 });
    expect(await issueSignupKey({ email: "a@b.co", name: "x", token: "bad" }, { store, verify: async () => false })).toMatchObject({ status: 403 });
    expect(keys).toHaveLength(0);
  });
  it("caps active keys per email", async () => {
    const { store } = memStore(3);
    expect(await issueSignupKey({ email: "a@b.co", name: "x", token: "t" }, { store, verify: ok })).toMatchObject({ status: 429 });
  });
  it("verifies tokens against Cloudflare siteverify", async () => {
    const calls: { url: string; body: string }[] = [];
    const fake = (success: boolean) => (async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body) }); return new Response(JSON.stringify({ success })); }) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", { secret: "s", ip: "1.2.3.4", fetchImpl: fake(true) })).toBe(true);
    expect(calls[0].url).toBe(TURNSTILE_VERIFY_URL);
    expect(new URLSearchParams(calls[0].body).get("response")).toBe("tok");
    expect(new URLSearchParams(calls[0].body).get("remoteip")).toBe("1.2.3.4");
    expect(await verifyTurnstile("tok", { secret: "s", fetchImpl: fake(false) })).toBe(false);
    expect(await verifyTurnstile("tok", { secret: "", fetchImpl: fake(true) })).toBe(false);
    expect(await verifyTurnstile("tok", { secret: "s", fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch })).toBe(false);
  });
});
