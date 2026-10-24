/**
 * Validates data/<entity>/<entity>.csv against schema/<entity>.schema.json and emits
 * dist/{csv,json}/<entity>.* , dist/avgeekdb.sqlite and dist/manifest.json.
 * Also copies artifacts to web/public/downloads for local dev.
 */
import { cpSync } from "node:fs";
import { join } from "node:path";
import { findDataDir } from "../api/src";
import { buildArtifacts } from "./build-artifacts";

const root = join(findDataDir(), "..");
const dist = join(root, "dist");
try {
  buildArtifacts(dist);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
cpSync(dist, join(root, "web", "public", "downloads"), { recursive: true });
console.log("Wrote dist/ and web/public/downloads/");
