import { UploadError, type UploadInput } from "./store";

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 100) * 1024 * 1024;
}

const REASON_STATUS = { unsupported_type: 400, unreadable: 400, too_large: 413 } as const;

export function uploadErrorResponse(e: unknown): Response | null {
  if (!(e instanceof UploadError)) return null;
  return Response.json({ reason: e.reason }, { status: REASON_STATUS[e.reason] });
}

/**
 * Validates the raw PUT request shared by upload and replace.
 * Returns the store input (without folderId) or an error Response.
 */
export function readUploadRequest(req: Request): Omit<UploadInput, "folderId"> | Response {
  const maxBytes = maxUploadBytes();
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!name) return Response.json({ reason: "unsupported_type" }, { status: 400 });
  const len = Number(req.headers.get("content-length"));
  if (req.headers.has("content-length") && Number.isFinite(len) && len > maxBytes) {
    return Response.json({ reason: "too_large" }, { status: 413 });
  }
  if (!req.body) return Response.json({ reason: "unreadable" }, { status: 400 });
  return { body: req.body, originalName: name, maxBytes };
}
