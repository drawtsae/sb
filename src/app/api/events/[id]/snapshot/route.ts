import { requireUserApi } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { getEventDetail } from "@/server/repo/events";
import { buildSnapshot } from "@/lib/offline/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const db = getDb();
  const user = await requireUserApi(req, db);
  if (user instanceof Response) return user;

  const { id } = await ctx.params;
  const detail = getEventDetail(db, id);
  if (!detail) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json(buildSnapshot(detail, new Date()), { headers: { "Cache-Control": "no-store" } });
}
