import fsp from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, isNull, sql, sum } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { backgroundTracks, cues, events, songs } from "@/server/db/schema";
import { deleteSongFile } from "@/server/music/store";
import { rowToSong, searchTextFor } from "@/server/repo/song-row";
import type { Song } from "@/lib/types";

export interface SongUsage {
  eventId: string;
  eventName: string;
}

export class SongInUseError extends Error {
  constructor(public usage: SongUsage[]) {
    super("song in use");
    this.name = "SongInUseError";
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** `folderId: undefined` = every folder, `null` = root only. Search is NFC-lowercase on `search_text`. */
export function listSongs(db: Db, opts: { folderId?: string | null; search?: string } = {}): Song[] {
  const conds = [];
  if (opts.folderId === null) conds.push(isNull(songs.folderId));
  else if (opts.folderId !== undefined) conds.push(eq(songs.folderId, opts.folderId));
  const q = (opts.search ?? "").normalize("NFC").toLowerCase().trim();
  if (q) conds.push(sql`${songs.searchText} LIKE ${"%" + escapeLike(q) + "%"} ESCAPE '\\'`);
  return db
    .select()
    .from(songs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(songs.title), asc(songs.id))
    .all()
    .map(rowToSong);
}

export function updateSong(
  db: Db,
  id: string,
  patch: Partial<Pick<Song, "title" | "artist" | "folderId">>,
): Song {
  const cur = db.select().from(songs).where(eq(songs.id, id)).get();
  if (!cur) throw new Error("song not found");
  const title = patch.title === undefined ? cur.title : patch.title.trim();
  if (!title) throw new Error("title required");
  const artist = patch.artist === undefined ? cur.artist : (patch.artist ?? "").trim();
  const folderId = patch.folderId === undefined ? cur.folderId : patch.folderId;
  const row = db
    .update(songs)
    .set({
      title,
      artist,
      folderId,
      searchText: searchTextFor(title, artist || null),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(songs.id, id))
    .returning()
    .get();
  return rowToSong(row);
}

/** Distinct events that use the song, via cues or background tracks. */
export function songUsage(db: Db, songId: string): SongUsage[] {
  const viaCues = db
    .select({ eventId: events.id, eventName: events.name })
    .from(cues)
    .innerJoin(events, eq(cues.eventId, events.id))
    .where(eq(cues.songId, songId))
    .all();
  const viaBg = db
    .select({ eventId: events.id, eventName: events.name })
    .from(backgroundTracks)
    .innerJoin(events, eq(backgroundTracks.eventId, events.id))
    .where(eq(backgroundTracks.songId, songId))
    .all();
  const seen = new Map<string, SongUsage>();
  for (const u of [...viaCues, ...viaBg]) seen.set(u.eventId, u);
  return [...seen.values()].sort((a, b) => a.eventName.localeCompare(b.eventName));
}

/** Throws SongInUseError when referenced. Deletes the row, then the file (a missing file is fine). */
export async function deleteSong(db: Db, id: string): Promise<void> {
  const row = db.select().from(songs).where(eq(songs.id, id)).get();
  if (!row) return;
  const usage = songUsage(db, id);
  if (usage.length > 0) throw new SongInUseError(usage);
  db.delete(songs).where(eq(songs.id, id)).run();
  await deleteSongFile(row.fileName).catch(() => {});
}

/** `diskFreeBytes` is null when the filesystem cannot be queried. */
export async function libraryUsage(
  db: Db,
): Promise<{ musicBytes: number; diskFreeBytes: number | null }> {
  const r = db.select({ total: sum(songs.fileSize) }).from(songs).get();
  const musicBytes = Number(r?.total ?? 0);
  try {
    const dataDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "./data");
    const s = await fsp.statfs(dataDir);
    return { musicBytes, diskFreeBytes: Number(s.bavail) * Number(s.bsize) };
  } catch {
    return { musicBytes, diskFreeBytes: null };
  }
}
