import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API_VERSION } from "../src";
import { applyApiVersion } from "../../scripts/set-api-version";

const root = join(import.meta.dirname, "../..");

describe("api version", () => {
  it("matches the package manifests and the OpenAPI specs", () => {
    for (const rel of ["package.json", "api/package.json", "web/package.json"]) {
      expect((JSON.parse(readFileSync(join(root, rel), "utf8")) as { version: string }).version).toBe(API_VERSION);
    }
    const lock = readFileSync(join(root, "package-lock.json"), "utf8");
    for (const needle of [
      `{\n  "name": "avgeekdb",\n  "version": "${API_VERSION}"`,
      `"name": "avgeekdb",\n      "version": "${API_VERSION}"`,
      `"name": "@avgeekdb/api",\n      "version": "${API_VERSION}"`,
      `"name": "@avgeekdb/web",\n      "version": "${API_VERSION}"`,
    ]) expect(lock).toContain(needle);
    for (const rel of ["web/openapi.yaml", "web/public/openapi.yaml"]) {
      expect(readFileSync(join(root, rel), "utf8")).toMatch(new RegExp(`^  version: ${API_VERSION}$`, "m"));
    }
  });

  it("writes the same semver into every copy", () => {
    const dir = join(tmpdir(), `avgeekdb-version-${Date.now()}`);
    mkdirSync(join(dir, "api/src"), { recursive: true });
    mkdirSync(join(dir, "web/public"), { recursive: true });
    try {
      writeFileSync(join(dir, "api/src/version.ts"), `export const API_VERSION = "0.1.0";\n`);
      for (const rel of ["package.json", "api/package.json", "web/package.json"]) {
        mkdirSync(join(dir, rel, ".."), { recursive: true });
        writeFileSync(join(dir, rel), JSON.stringify({ name: rel, version: "0.1.0" }, null, 2) + "\n");
      }
      const yaml = "openapi: 3.1.0\ninfo:\n  title: AVGeekDB API\n  version: 0.1.0\n";
      writeFileSync(join(dir, "web/openapi.yaml"), yaml);
      writeFileSync(join(dir, "web/public/openapi.yaml"), yaml);
      writeFileSync(join(dir, "package-lock.json"), [
        `{`,
        `  "name": "avgeekdb",`,
        `  "version": "0.1.0",`,
        `  "packages": {`,
        `    "": {`,
        `      "name": "avgeekdb",`,
        `      "version": "0.1.0",`,
        `    },`,
        `    "api": {`,
        `      "name": "@avgeekdb/api",`,
        `      "version": "0.1.0",`,
        `    },`,
        `    "web": {`,
        `      "name": "@avgeekdb/web",`,
        `      "version": "0.1.0",`,
        `    }`,
        `  }`,
        `}`,
        ``,
      ].join("\n"));
      applyApiVersion(dir, "0.2.0");
      expect(readFileSync(join(dir, "api/src/version.ts"), "utf8")).toContain(`export const API_VERSION = "0.2.0";`);
      expect((JSON.parse(readFileSync(join(dir, "web/package.json"), "utf8")) as { version: string }).version).toBe("0.2.0");
      expect(readFileSync(join(dir, "web/public/openapi.yaml"), "utf8")).toContain("  version: 0.2.0");
      expect(readFileSync(join(dir, "package-lock.json"), "utf8")).toContain(`"name": "@avgeekdb/web",\n      "version": "0.2.0"`);
      expect(() => applyApiVersion(dir, "1.2")).toThrow(/semver/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
