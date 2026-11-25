import { eq } from "drizzle-orm";
import { requireUserApi } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { songs } from "@/server/db/schema";
import { rowToSong } from "@/server/repo/song-row";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const db = getDb();
  const user = await requireUserApi(req, db);
  if (user instanceof Response) return user;

  const h = new URL(req.url).searchParams.get("h") ?? "";
  if (!/^[0-9a-f]{64}$/.test(h)) return Response.json({ error: "bad_hash" }, { status: 400 });
  const row = db.select().from(songs).where(eq(songs.contentHash, h)).limit(1).get();
  return Response.json({ song: row ? rowToSong(row) : null });
}
