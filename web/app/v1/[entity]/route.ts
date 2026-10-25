import { API_VERSION, NO_STORE, handleEntityRequest, type Entity } from "@avgeekdb/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public path -> internal entity name
const MAP: Record<string, Entity> = { airports: "airports", airlines: "airlines", aircraft: "aircraft_types" };

export async function GET(req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const entity = MAP[(await ctx.params).entity];
  if (!entity) return Response.json({ error: "Not found" }, { status: 404, headers: { ...NO_STORE, "x-api-version": API_VERSION } });
  return handleEntityRequest(entity, req);
}
