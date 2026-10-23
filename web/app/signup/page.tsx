import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getAuthUser } from "@/lib/supabase/session";

export default async function Page() {
  if (await getAuthUser()) redirect("/dashboard");
  return (
    <main>
      <h1>Sign up</h1>
      <AuthForm mode="signup" />
      <p><Link href="/login">Already have an account? Log in</Link></p>
    </main>
  );
}
