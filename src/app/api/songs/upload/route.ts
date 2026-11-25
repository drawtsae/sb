import { eq } from "drizzle-orm";
import { requireUserApi } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { folders } from "@/server/db/schema";
import { readUploadRequest, uploadErrorResponse } from "@/server/music/http";
import { storeUpload } from "@/server/music/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request): Promise<Response> {
  const db = getDb();
  const user = await requireUserApi(req, db);
  if (user instanceof Response) return user;

  const input = readUploadRequest(req);
  if (input instanceof Response) return input;

  const folderId = new URL(req.url).searchParams.get("folderId") || null;
  if (folderId && !db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).get()) {
    return Response.json({ reason: "unknown_folder" }, { status: 400 });
  }

  try {
    const song = await storeUpload(db, { ...input, folderId });
    return Response.json(song, { status: 201 });
  } catch (e) {
    const res = uploadErrorResponse(e);
    if (res) return res;
    throw e;
  }
}
