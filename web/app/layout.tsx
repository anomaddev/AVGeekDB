import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "AVGeekDB", description: "Open data and a free API for aircraft, airlines and airports." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto", padding: 16 }}>
        <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <Link href="/"><b>AVGeekDB</b></Link><Link href="/docs">API docs</Link><Link href="/downloads">Downloads</Link>
          <Link href="/contribute">Contribute</Link><Link href="/dashboard">Dashboard</Link><Link href="/login">Log in</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
