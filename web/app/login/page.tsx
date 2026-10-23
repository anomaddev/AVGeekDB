import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { safeNext } from "@/lib/supabase/redirect";
import { getAuthUser } from "@/lib/supabase/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getAuthUser()) redirect(next);
  return (
    <main>
      <h1>Log in</h1>
      {sp.error === "auth" && <p>That sign-in link is invalid or expired.</p>}
      <AuthForm mode="login" next={next} />
      <p><Link href="/signup">Create an account</Link></p>
    </main>
  );
}
