/**
 * Write one semver into every copy of the API version.
 * Usage: npm run version:set -- 0.2.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;

const PACKAGES = ["package.json", "api/package.json", "web/package.json"];
const OPENAPI = ["web/openapi.yaml", "web/public/openapi.yaml"];

const LOCK_VERSIONS = [
  `{\n  "name": "avgeekdb",\n  "version": "`,
  `    "": {\n      "name": "avgeekdb",\n      "version": "`,
  `    "api": {\n      "name": "@avgeekdb/api",\n      "version": "`,
  `    "web": {\n      "name": "@avgeekdb/web",\n      "version": "`,
];

export function applyApiVersion(root: string, version: string): void {
  if (!SEMVER.test(version)) throw new Error(`version must be semver (x.y.z), got ${version}`);
  const versionFile = join(root, "api/src/version.ts");
  const current = readFileSync(versionFile, "utf8").match(/export const API_VERSION = "([^"]+)";/)?.[1];
  if (!current) throw new Error("API_VERSION constant not found");
  writeFileSync(versionFile, readFileSync(versionFile, "utf8").replace(
    `export const API_VERSION = "${current}";`,
    `export const API_VERSION = "${version}";`,
  ));
  for (const rel of PACKAGES) {
    const path = join(root, rel);
    const json = JSON.parse(readFileSync(path, "utf8")) as { version: string };
    json.version = version;
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  }
  for (const rel of OPENAPI) {
    const path = join(root, rel);
    const yaml = readFileSync(path, "utf8");
    const next = yaml.replace(/^  version: .+$/m, `  version: ${version}`);
    if (next === yaml) throw new Error(`info.version not found in ${rel}`);
    writeFileSync(path, next);
  }
  const lockPath = join(root, "package-lock.json");
  let lock = readFileSync(lockPath, "utf8");
  for (const prefix of LOCK_VERSIONS) {
    const from = `${prefix}${current}"`;
    const to = `${prefix}${version}"`;
    if (!lock.includes(from)) throw new Error(`lockfile version not found after ${prefix.trim()}`);
    lock = lock.replace(from, to);
  }
  writeFileSync(lockPath, lock);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: npm run version:set -- x.y.z");
    process.exit(1);
  }
  try {
    applyApiVersion(join(dirname(fileURLToPath(import.meta.url)), ".."), version);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log(`api version ${version}`);
}
