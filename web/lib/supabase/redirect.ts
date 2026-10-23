/** Relative in-app path. Rejects protocol-relative and absolute URLs. */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return fallback;
  return value;
}
