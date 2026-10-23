import { createServiceClient, issueSignupKey, SupabaseSignupStore } from "@avgeekdb/api";

export const dynamic = "force-dynamic";

/** POST { email, name, token } -> { key } once. Turnstile is verified server-side; only the key hash is stored. */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  let store: SupabaseSignupStore;
  try { store = new SupabaseSignupStore(createServiceClient()); } catch { return Response.json({ error: "Sign-up is not configured." }, { status: 503 }); }
  const result = await issueSignupKey({ email: body.email, name: body.name, token: body["cf-turnstile-response"] ?? body.token, ip }, { store });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ key: result.key }, { status: 201, headers: { "cache-control": "no-store" } });
}
