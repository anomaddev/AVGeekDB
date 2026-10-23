import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { join } from "node:path";

// Scripts and the Next app share the repo-root env file. Next only auto-loads web/.env*.
loadEnvConfig(join(__dirname, ".."));

const config: NextConfig = {
  // Hostinger runs only `npm run build`; standalone gives a self-contained server at .next/standalone/web/server.js.
  output: "standalone",
  transpilePackages: ["@avgeekdb/api"],
  serverExternalPackages: ["csv-parse"],
  turbopack: { root: join(__dirname, "..") },
  // npm workspaces: trace from repo root so @avgeekdb/api is bundled. Data files are copied by scripts/postbuild-standalone.mjs.
  outputFileTracingRoot: join(__dirname, ".."),
  // Public API lives at /v1/* (app/v1/[entity]/route.ts). Legacy alias:
  async rewrites() { return [{ source: "/api/v1/:path*", destination: "/v1/:path*" }]; },
};
export default config;
