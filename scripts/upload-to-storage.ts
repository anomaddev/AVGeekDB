/**
 * STUB: publish dist/ to Supabase Storage (bucket $SUPABASE_STORAGE_BUCKET, public read).
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Not run in CI by default.
 * Layout: <bucket>/<version>/... and <bucket>/latest/...
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "downloads";
const dryRun = !url || !key || process.argv.includes("--dry-run");

const dist = join(process.cwd(), "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8")) as { data_version: string; files: { path: string }[] };

for (const prefix of [manifest.data_version, "latest"]) {
  for (const f of [...manifest.files.map((x) => x.path), "manifest.json"]) {
    const dest = `${bucket}/${prefix}/${f}`;
    if (dryRun) { console.log(`[dry-run] would upload dist/${f} -> ${dest}`); continue; }
    // TODO: switch to @supabase/supabase-js storage.upload once real project exists.
    const res = await fetch(`${url}/storage/v1/object/${dest}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "x-upsert": "true" },
      body: readFileSync(join(dist, f)),
    });
    if (!res.ok) throw new Error(`upload ${dest} failed: ${res.status} ${await res.text()}`);
    console.log(`uploaded ${dest}`);
  }
}
