// Completes the Next standalone bundle: static assets, public/, and runtime data/.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, "web", ".next", "standalone");
if (!existsSync(join(standalone, "web", "server.js"))) throw new Error(`standalone server.js missing under ${standalone}`);
const copy = (from, to, filter) => { rmSync(to, { recursive: true, force: true }); cpSync(from, to, { recursive: true, filter }); console.log(`copied ${from} -> ${to}`); };
copy(join(root, "web", ".next", "static"), join(standalone, "web", ".next", "static"));
if (existsSync(join(root, "web", "public"))) copy(join(root, "web", "public"), join(standalone, "web", "public"));
copy(join(root, "data"), join(standalone, "data"), (src) => !src.includes("temp_data"));

// Hostinger's Next.js app type runs server.js from the standalone root, not standalone/web/.
// Flatten the web app up beside the hoisted node_modules so `next` resolves, keeping web/ for the old entry path.
const webDir = join(standalone, "web");
for (const entry of readdirSync(webDir)) {
  const from = join(webDir, entry), to = join(standalone, entry);
  if (entry === "node_modules") { cpSync(from, to, { recursive: true, force: false, errorOnExist: false }); continue; }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}
console.log(`flattened ${webDir} -> ${standalone}`);
