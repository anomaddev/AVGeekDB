import { redirect } from "next/navigation";
import { isSupabaseConfigured, SUPABASE_SETUP_HINT } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/** Admin placeholder. Editors and admins can open it. Review tools are not built yet. */
export default async function Admin() {
  if (!isSupabaseConfigured()) {
    return <main><h1>Admin</h1><p>{SUPABASE_SETUP_HINT}</p></main>;
  }
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/admin");
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_role", { r: "editor" });
  if (error || !allowed) {
    return <main><h1>Admin</h1><p>The editor or admin role is required.</p></main>;
  }
  return (
    <main>
      <h1>Admin</h1>
      <p>Signed in as {user.email ?? user.id}.</p>
      <p>Placeholder. Planned: submission review queue (editor), role management (admin), dataset version publishing (admin).</p>
    </main>
  );
}
