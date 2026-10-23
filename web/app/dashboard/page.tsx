import { redirect } from "next/navigation";
import { isMock } from "@avgeekdb/api";
import { KeyManager, type DashboardKey } from "@/components/KeyManager";
import { isSupabaseConfigured, SUPABASE_SETUP_HINT } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!isSupabaseConfigured()) {
    return <main><h1>Your API keys</h1><p>{SUPABASE_SETUP_HINT}</p></main>;
  }
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/dashboard");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, created_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) {
    return <main><h1>Your API keys</h1><p>Could not load keys.</p></main>;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: usage, error: usageError } = await supabase
    .from("api_usage_daily")
    .select("api_key_id, requests")
    .gte("day", since);
  const totals = new Map<string, number>();
  if (!usageError) {
    for (const row of usage ?? []) {
      const id = String(row.api_key_id);
      totals.set(id, (totals.get(id) ?? 0) + Number(row.requests));
    }
  }

  const keys: DashboardKey[] = (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    prefix: String(row.prefix),
    created_at: String(row.created_at),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    requests_30d: usageError ? null : totals.get(String(row.id)) ?? 0,
  }));

  return (
    <main>
      <h1>Your API keys</h1>
      <p>Signed in as {user.email ?? user.id}.</p>
      {isMock() && <p>Mock mode is on, so <code>/v1</code> still accepts the demo key. Set <code>AVGEEKDB_MOCK=false</code> to require these keys. Responses still come from the CSV snapshot.</p>}
      {usageError && <p>Usage counts are unavailable.</p>}
      <KeyManager keys={keys} />
    </main>
  );
}
