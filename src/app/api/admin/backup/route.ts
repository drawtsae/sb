import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { requireAdminApi } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { backupDatabase } from "@/server/db/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");

function backupName(d = new Date()): string {
  return `soundboard-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.db`;
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdminApi(req);
  if (auth instanceof Response) return auth;

  const tmp = path.join(os.tmpdir(), `sb-backup-${crypto.randomBytes(8).toString("hex")}.db`);
  const cleanup = () => fs.rm(tmp, { force: true }, () => {});
  try {
    backupDatabase(getDb(), tmp);
    const stream = fs.createReadStream(tmp);
    stream.on("close", cleanup);
    stream.on("error", cleanup);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${backupName()}"`,
        "Content-Length": String(fs.statSync(tmp).size),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
