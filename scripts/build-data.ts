/**
 * Validates data/<entity>/<entity>.csv against schema/<entity>.schema.json and emits
 * dist/{csv,json}/<entity>.* , a CSV-shaped dist/avgeekdb.sqlite, and dist/manifest.json.
 * Copies artifacts to web/public/downloads, then replaces that sqlite with data/avgeekdb.sqlite
 * (the Supabase dump) when the committed file is present.
 */
import { cpSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findDataDir } from "../api/src";
import { buildArtifacts, mergeRepoSqlite, publishRepoDownloads, type ArtifactManifest } from "./build-artifacts";

const dataDir = findDataDir();
const root = join(dataDir, "..");
const dist = join(root, "dist");
let manifest: ArtifactManifest;
try {
  manifest = buildArtifacts(dist);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
const repoFiles = publishRepoDownloads(dist, dataDir);
const downloads = join(root, "web", "public", "downloads");
cpSync(dist, downloads, { recursive: true });
const sqlite = join(dataDir, "avgeekdb.sqlite");
if (existsSync(sqlite)) {
  cpSync(sqlite, join(downloads, "avgeekdb.sqlite"));
  writeFileSync(join(downloads, "manifest.json"), JSON.stringify(mergeRepoSqlite(manifest, sqlite), null, 2));
}
console.log(`Wrote dist/, web/public/downloads/, and ${repoFiles.map((path) => `data/${path}`).join(", ")}`);
