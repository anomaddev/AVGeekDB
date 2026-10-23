import type { NextConfig } from "next";
import { join } from "node:path";

const config: NextConfig = {
  transpilePackages: ["@avgeekdb/api"],
  serverExternalPackages: ["csv-parse"],
  turbopack: { root: join(__dirname, "..") },
  outputFileTracingRoot: join(__dirname, ".."),
  // Public API lives at /v1/* (app/v1/[entity]/route.ts). Legacy alias:
  async rewrites() { return [{ source: "/api/v1/:path*", destination: "/v1/:path*" }]; },
};
export default config;
