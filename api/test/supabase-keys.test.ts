import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, SupabaseKeyStore } from "../src/supabase";

const ENV_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function withoutCredentials(run: () => void) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  try { run(); } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function fakeClient(opts: {
  find: { data: { id: string; user_id: string; revoked_at: string | null } | null; error: { message: string } | null };
  insert?: { error: { message: string } | null };
  touch?: { error: { message: string } | null };
  onInsert?: (row: unknown) => void;
  onTouch?: (id: string) => void;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "api_keys") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => opts.find }) }),
          update: () => ({ eq: async (_col: string, id: string) => { opts.onTouch?.(id); return opts.touch ?? { error: null }; } }),
        };
      }
      if (table === "api_usage") {
        return { insert: async (row: unknown) => { opts.onInsert?.(row); return opts.insert ?? { error: null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("supabase service client", () => {
  it("refuses missing and placeholder credentials", () => {
    withoutCredentials(() => {
      expect(() => createServiceClient()).toThrow(/not configured/);
      process.env.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key";
      expect(() => createServiceClient()).toThrow(/not configured/);
    });
  });
});

describe("SupabaseKeyStore", () => {
  it("returns active and revoked keys and records usage", async () => {
    const active = fakeClient({ find: { data: { id: "k1", user_id: "u1", revoked_at: null }, error: null } });
    const found = await new SupabaseKeyStore(active).findByHash("abc");
    expect(found).toEqual({ id: "k1", user_id: "u1", revoked_at: null });

    const revoked = fakeClient({ find: { data: { id: "k2", user_id: "u1", revoked_at: "2026-01-01T00:00:00Z" }, error: null } });
    expect((await new SupabaseKeyStore(revoked).findByHash("abc"))?.revoked_at).toBe("2026-01-01T00:00:00Z");

    const missing = fakeClient({ find: { data: null, error: null } });
    expect(await new SupabaseKeyStore(missing).findByHash("nope")).toBeNull();

    let inserted: unknown, touched = "";
    const store = new SupabaseKeyStore(fakeClient({
      find: { data: null, error: null },
      onInsert: (row) => { inserted = row; },
      onTouch: (id) => { touched = id; },
    }));
    await store.recordUsage("k1", "/v1/airports", 200);
    expect(inserted).toEqual({ api_key_id: "k1", endpoint: "/v1/airports", status: 200 });
    expect(touched).toBe("k1");
  });

  it("fails closed when the lookup errors", async () => {
    const store = new SupabaseKeyStore(fakeClient({ find: { data: null, error: { message: "db down" } } }));
    await expect(store.findByHash("abc")).rejects.toThrow(/db down/);
  });
});
