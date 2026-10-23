import Link from "next/link";
export default function Home() {
  return (
    <main>
      <h1>AVGeekDB</h1>
      <p>Open, easy-to-use data for <b>aircraft types</b>, <b>airlines</b> and <b>airports</b>: download full dumps (CSV, JSON, SQLite) or query the free API.</p>
      <p style={{ background: "#fff3cd", padding: 8 }}>Preview: currently serving a handful of SAMPLE rows only.</p>
      <p><Link href="/get-key">Get a free API key</Link> · <Link href="/docs">Read the docs</Link></p>
    </main>
  );
}
