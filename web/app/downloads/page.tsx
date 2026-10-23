import { readFileSync } from "node:fs";
import { join } from "node:path";

type Manifest = { data_version: string; generated_at: string; sample: boolean; files: { path: string; bytes: number; sha256: string }[] };

function manifest(): Manifest | null {
  try { return JSON.parse(readFileSync(join(process.cwd(), "public", "downloads", "manifest.json"), "utf8")); } catch { return null; }
}

export const dynamic = "force-static";

export default function Downloads() {
  const m = manifest();
  // In production, links point at Supabase Storage: <SUPABASE_URL>/storage/v1/object/public/<bucket>/latest/<file>
  return (
    <main>
      <h1>Downloads</h1>
      {!m ? <p>No build yet. Run <code>npm run data:build</code>.</p> : (
        <>
          <p>Data version <b>{m.data_version}</b>{m.sample && " (SAMPLE data)"}, built {m.generated_at}.</p>
          <table><thead><tr><th>File</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>
            {m.files.map((f) => (<tr key={f.path}><td><a href={`/downloads/${f.path}`}>{f.path}</a></td><td>{f.bytes} B</td><td><code>{f.sha256.slice(0, 12)}…</code></td></tr>))}
          </tbody></table>
        </>
      )}
      <p>License: code MIT, data license TBD (see README).</p>
    </main>
  );
}
