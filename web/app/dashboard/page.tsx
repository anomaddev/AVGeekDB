"use client";
import { useState } from "react";

type Key = { id: string; name: string; prefix: string; created_at: string; revoked_at: string | null; requests_30d: number };

/**
 * API key dashboard (STUB). Lists, creates, revokes keys and shows usage.
 * TODO: require Supabase session; create via POST /dashboard/keys (server, service role:
 * generateApiKey() -> insert {prefix, key_hash}); list from api_keys + api_usage_daily; revoke = set revoked_at.
 */
export default function Dashboard() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  function create() {
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    const key = `avg_${rand}`;
    setShown(key);
    setKeys((k) => [...k, { id: crypto.randomUUID(), name: `key ${k.length + 1}`, prefix: key.slice(0, 12), created_at: new Date().toISOString(), revoked_at: null, requests_30d: 0 }]);
  }
  const revoke = (id: string) => setKeys((k) => k.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)));
  return (
    <main>
      <h1>Your API keys</h1>
      <p style={{ background: "#fff3cd", padding: 8 }}>Stub: local state only, not connected to Supabase yet.</p>
      <button onClick={create}>Create key</button>
      {shown && <p>New key (copy now, it won&apos;t be shown again): <code>{shown}</code></p>}
      <table><thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Requests (30d)</th><th>Status</th><th /></tr></thead><tbody>
        {keys.map((k) => (
          <tr key={k.id}><td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{k.created_at.slice(0, 10)}</td><td>{k.requests_30d}</td>
            <td>{k.revoked_at ? "revoked" : "active"}</td><td>{!k.revoked_at && <button onClick={() => revoke(k.id)}>Revoke</button>}</td></tr>
        ))}
      </tbody></table>
    </main>
  );
}
