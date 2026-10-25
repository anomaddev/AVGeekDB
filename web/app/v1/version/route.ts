import { handleVersionRequest } from "@avgeekdb/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handleVersionRequest();
}
