import type { EventDetail, ShowSnapshot, Song } from "@/lib/types";

export const SNAPSHOT_KEY = "sb:snapshot";

/** Freezes an event into what Live needs: only the referenced songs, cues in position order. */
export function buildSnapshot(detail: EventDetail, now: Date): ShowSnapshot {
  const background = detail.background.map((t) => t.songId);
  const ids = new Set<string>(background);
  for (const c of detail.cues) if (c.songId) ids.add(c.songId);
  const songs: Record<string, Song> = {};
  for (const id of ids) {
    const s = detail.songs[id];
    if (s) songs[id] = s;
  }
  return {
    version: 1,
    eventId: detail.event.id,
    eventName: detail.event.name,
    takenAt: now.toISOString(),
    settings: detail.event.settings,
    songs,
    background,
    cues: [...detail.cues].sort((a, b) => a.position - b.position),
  };
}

export function saveSnapshot(s: ShowSnapshot): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
}

export function readSnapshot(): ShowSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ShowSnapshot;
    return s && s.version === 1 ? s : null;
  } catch {
    return null;
  }
}
