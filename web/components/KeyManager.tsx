"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createApiKey, revokeApiKey } from "@/app/dashboard/actions";

export type DashboardKey = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  requests_30d: number | null;
};

export function KeyManager({ keys }: { keys: DashboardKey[] }) {
  const router = useRouter();
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onCreate(fd: FormData) {
    setPending(true);
    setError("");
    try {
      const result = await createApiKey(fd);
      if ("error" in result) return setError(result.error);
      setShown(result.key);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onRevoke(id: string) {
    setPending(true);
    setError("");
    try {
      const result = await revokeApiKey(id);
      if ("error" in result) return setError(result.error);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form action={onCreate}>
        <p><input name="name" placeholder="key name" maxLength={80} /></p>
        <button type="submit" disabled={pending}>Create key</button>
      </form>
      {error && <p>{error}</p>}
      {shown && <p>New key (copy now, it will not be shown again): <code>{shown}</code></p>}
      <table>
        <thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Requests (30d)</th><th>Status</th><th /></tr></thead>
        <tbody>
          {keys.length === 0 && <tr><td colSpan={6}>No keys yet.</td></tr>}
          {keys.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td>
              <td><code>{k.prefix}…</code></td>
              <td>{k.created_at.slice(0, 10)}</td>
              <td>{k.requests_30d ?? "—"}</td>
              <td>{k.revoked_at ? "revoked" : "active"}</td>
              <td>{!k.revoked_at && <button type="button" disabled={pending} onClick={() => onRevoke(k.id)}>Revoke</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
