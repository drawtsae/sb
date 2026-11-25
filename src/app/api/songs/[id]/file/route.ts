import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { requireUserApi } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { songs } from "@/server/db/schema";
import { readUploadRequest, uploadErrorResponse } from "@/server/music/http";
import { musicPath, replaceSongFile } from "@/server/music/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

/** Parses a single `bytes=a-b` / `a-` / `-n` range. null = no/ignored header, "invalid" = 416. */
function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // malformed or multi-range: serve whole file
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const db = getDb();
  const user = await requireUserApi(req, db);
  if (user instanceof Response) return user;

  const { id } = await params;
  const song = db.select().from(songs).where(eq(songs.id, id)).get();
  if (!song) return notFound();

  let file: string;
  let size: number;
  try {
    file = musicPath(song.fileName);
    size = (await stat(file)).size;
  } catch {
    return notFound();
  }

  const base = {
    "Content-Type": song.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  const range = parseRange(req.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...base,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const db = getDb();
  const user = await requireUserApi(req, db);
  if (user instanceof Response) return user;

  const { id } = await params;
  const exists = db.select({ id: songs.id }).from(songs).where(eq(songs.id, id)).get();
  if (!exists) return notFound();

  const input = readUploadRequest(req);
  if (input instanceof Response) return input;

  try {
    const song = await replaceSongFile(db, id, { ...input, folderId: null });
    return Response.json(song);
  } catch (e) {
    const res = uploadErrorResponse(e);
    if (res) return res;
    throw e;
  }
}
