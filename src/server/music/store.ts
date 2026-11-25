import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { parseFile } from "music-metadata";
import type { Db } from "@/server/db/client";
import { songs } from "@/server/db/schema";
import { rowToSong, searchTextFor } from "@/server/repo/song-row";
import type { Song } from "@/lib/types";

export const ALLOWED = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
} as const;
type Ext = keyof typeof ALLOWED;

export type UploadReason = "unsupported_type" | "too_large" | "unreadable";

export class UploadError extends Error {
  constructor(public reason: UploadReason) {
    super(reason);
    this.name = "UploadError";
  }
}

export interface UploadInput {
  body: ReadableStream<Uint8Array>;
  originalName: string;
  folderId: string | null;
  maxBytes: number;
}

const baseName = (name: string) => name.split(/[\\/]/).pop() ?? "";

export function titleFromFilename(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).normalize("NFC").trim();
}

function musicDir(): string {
  return path.join(path.resolve(process.cwd(), process.env.DATA_DIR ?? "./data"), "music");
}

/** Absolute path of a stored file. Rejects anything that is not a bare file name. */
export function musicPath(fileName: string): string {
  if (
    !fileName ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0")
  ) {
    throw new Error("invalid file name");
  }
  return path.join(musicDir(), fileName);
}

function extOf(originalName: string): Ext {
  const base = baseName(originalName);
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, ext)) throw new UploadError("unsupported_type");
  return ext as Ext;
}

const rmQuiet = (p: string) => fsp.rm(p, { force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});

export async function deleteSongFile(fileName: string): Promise<void> {
  await fsp.rm(musicPath(fileName), { force: true, maxRetries: 5, retryDelay: 50 });
}

interface Ingested {
  tmp: string;
  ext: Ext;
  hash: string;
  size: number;
  title: string;
  artist: string | null;
  durationSec: number;
}

/** Streams the body to a temp file, hashing and counting. Cleans up the temp file on failure. */
async function ingest(input: UploadInput): Promise<Ingested> {
  const ext = extOf(input.originalName);
  const dir = musicDir();
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${randomUUID()}`);
  const hash = createHash("sha256");
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > input.maxBytes) return cb(new UploadError("too_large"));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(input.body as unknown as NodeWebStream<Uint8Array>),
      counter,
      fs.createWriteStream(tmp),
    );
    let title: string | undefined;
    let artist: string | undefined;
    let duration: number | undefined;
    try {
      const meta = await parseFile(tmp);
      title = meta.common.title?.normalize("NFC").trim();
      artist = meta.common.artist?.normalize("NFC").trim();
      duration = meta.format.duration;
    } catch {
      throw new UploadError("unreadable");
    }
    if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
      throw new UploadError("unreadable");
    }
    return {
      tmp,
      ext,
      hash: hash.digest("hex"),
      size,
      title: title || titleFromFilename(input.originalName),
      artist: artist || null,
      durationSec: duration,
    };
  } catch (e) {
    await rmQuiet(tmp);
    throw e;
  }
}

export async function storeUpload(db: Db, input: UploadInput): Promise<Song> {
  const up = await ingest(input);
  const id = randomUUID();
  const fileName = `${id}.${up.ext}`;
  const final = musicPath(fileName);
  try {
    await fsp.rename(up.tmp, final);
    const row = db
      .insert(songs)
      .values({
        id,
        folderId: input.folderId,
        title: up.title,
        artist: up.artist ?? "",
        durationSec: up.durationSec,
        fileName,
        fileSize: up.size,
        mimeType: ALLOWED[up.ext],
        contentHash: up.hash,
        searchText: searchTextFor(up.title, up.artist),
      })
      .returning()
      .get();
    return rowToSong(row);
  } catch (e) {
    await rmQuiet(up.tmp);
    await rmQuiet(final);
    throw e;
  }
}

/** Replaces a song's audio, keeping its id. Throws a plain Error when the song does not exist. */
export async function replaceSongFile(db: Db, songId: string, input: UploadInput): Promise<Song> {
  const old = db.select().from(songs).where(eq(songs.id, songId)).get();
  if (!old) throw new Error("song not found");
  const up = await ingest(input);
  const fileName = `${songId}.${up.ext}`;
  const final = musicPath(fileName);
  const sameFile = fileName === old.fileName;
  try {
    await fsp.rename(up.tmp, final);
    const row = db
      .update(songs)
      .set({
        title: up.title,
        artist: up.artist ?? "",
        durationSec: up.durationSec,
        fileName,
        fileSize: up.size,
        mimeType: ALLOWED[up.ext],
        contentHash: up.hash,
        searchText: searchTextFor(up.title, up.artist),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(songs.id, songId))
      .returning()
      .get();
    if (!sameFile) await deleteSongFile(old.fileName).catch(() => {});
    return rowToSong(row);
  } catch (e) {
    await rmQuiet(up.tmp);
    if (!sameFile) await rmQuiet(final);
    throw e;
  }
}
