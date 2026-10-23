/**
 * Validates data/<entity>/<entity>.csv against schema/<entity>.schema.json and emits
 * dist/{csv,json}/<entity>.* , dist/avgeekdb.sqlite and dist/manifest.json.
 * Also copies artifacts to web/public/downloads for local dev.
 */
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { stringify } from "csv-stringify/sync";
import Database from "better-sqlite3";
import { ENTITIES, loadEntity, findDataDir, currentDataVersion } from "../api/src";

const root = join(findDataDir(), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "csv"), { recursive: true });
mkdirSync(join(dist, "json"), { recursive: true });

const version = currentDataVersion();
const ajv = new Ajv2020({ allErrors: true });
const db = new Database(join(dist, "avgeekdb.sqlite"));
db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
db.prepare("INSERT INTO meta VALUES ('data_version', ?)").run(version);
let failed = false;
const files: { path: string; bytes: number; sha256: string }[] = [];

for (const entity of ENTITIES) {
  const schema = JSON.parse(readFileSync(join(root, "schema", `${entity}.schema.json`), "utf8"));
  const validate = ajv.compile(schema);
  const rows = loadEntity(entity);
  rows.forEach((r, i) => {
    if (!validate(r)) { failed = true; console.error(`${entity} row ${i + 2}:`, ajv.errorsText(validate.errors)); }
  });
  writeFileSync(join(dist, "json", `${entity}.json`), JSON.stringify({ data_version: version, sample: true, data: rows }, null, 2));
  writeFileSync(join(dist, "csv", `${entity}.csv`), `# avgeekdb data_version=${version}\n` + stringify(rows, { header: true, cast: { boolean: (b) => String(b) } }));

  const cols = Object.keys(schema.properties as object);
  db.exec(`CREATE TABLE ${entity} (${cols.map((c) => `"${c}"`).join(", ")})`);
  const ins = db.prepare(`INSERT INTO ${entity} VALUES (${cols.map(() => "?").join(", ")})`);
  db.transaction(() => rows.forEach((r) => ins.run(cols.map((c) => (typeof r[c] === "boolean" ? Number(r[c]) : r[c] ?? null)))))();
  console.log(`${entity}: ${rows.length} rows`);
}
db.close();
if (failed) { console.error("Validation failed"); process.exit(1); }

for (const p of [...ENTITIES.flatMap((e) => [`csv/${e}.csv`, `json/${e}.json`]), "avgeekdb.sqlite"]) {
  const buf = readFileSync(join(dist, p));
  files.push({ path: p, bytes: statSync(join(dist, p)).size, sha256: createHash("sha256").update(buf).digest("hex") });
}
writeFileSync(join(dist, "manifest.json"), JSON.stringify({ data_version: version, sample: true, generated_at: new Date().toISOString(), files }, null, 2));
cpSync(dist, join(root, "web", "public", "downloads"), { recursive: true });
console.log("Wrote dist/ and web/public/downloads/");
