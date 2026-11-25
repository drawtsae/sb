import type { songs } from "@/server/db/schema";
import type { Song } from "@/lib/types";

export type SongRow = typeof songs.$inferSelect;

/** DB row -> domain Song. The DB stores a missing artist as ''. */
export function rowToSong(row: SongRow): Song {
  return {
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    artist: row.artist === "" ? null : row.artist,
    durationSec: row.durationSec,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
  };
}

/** Lowercased NFC `title + ' ' + artist`, for Vietnamese-aware search. */
export function searchTextFor(title: string, artist: string | null): string {
  return (title + " " + (artist ?? "")).normalize("NFC").toLowerCase().trim();
}
