import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "./auth/actions";
import { getAuthUser } from "@/lib/supabase/session";

export const metadata = { title: "AVGeekDB", description: "Open data and a free API for aircraft, airlines and airports." };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto", padding: 16 }}>
        <nav style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "center" }}>
          <Link href="/"><b>AVGeekDB</b></Link><Link href="/docs">API docs</Link><Link href="/downloads">Downloads</Link>
          <Link href="/contribute">Contribute</Link><Link href="/dashboard">Dashboard</Link>
          {user ? (
            <>
              <span>{user.email ?? "Account"}</span>
              <form action={signOut}><button type="submit">Log out</button></form>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link><Link href="/signup">Sign up</Link>
            </>
          )}
        </nav>
        {children}
      </body>
    </html>
  );
}
