import type { ShowSnapshot, Song } from "@/lib/types";

export const MUSIC_CACHE = "sb-music-v1";

export const ERR_NETWORK = "Không tải được bài (lỗi mạng)";
export const ERR_PROBE = "File không phát được";
export const ERR_START = "Giây bắt đầu vượt quá độ dài bài";
export const ERR_END = "Giây kết thúc vượt quá độ dài bài";
export const ERR_MISSING = "Bài không còn trong kho";
const ERR_STORE = "Không lưu được bài vào bộ nhớ trình duyệt";

const CONCURRENCY = 3;
const RETRIES = 2;

export type LoadItem = {
  songId: string;
  title: string;
  status: "pending" | "downloading" | "ok" | "error";
  reason?: string;
};
export type CueError = { cueId: string; reason: string };

export function cacheKey(song: Song): string {
  return `/__music/${song.id}?h=${song.contentHash}`;
}

export async function getCachedBlob(song: Song, caches: CacheStorage): Promise<Blob | null> {
  const cache = await caches.open(MUSIC_CACHE);
  const res = await cache.match(cacheKey(song));
  return res ? await res.blob() : null;
}

export function validateCueTimes(snap: ShowSnapshot, durations: Record<string, number> = {}): CueError[] {
  const errors: CueError[] = [];
  for (const cue of snap.cues) {
    if (cue.kind !== "song") continue;
    const song = cue.songId ? snap.songs[cue.songId] : undefined;
    if (!song) {
      errors.push({ cueId: cue.id, reason: ERR_MISSING });
      continue;
    }
    const duration = durations[song.id] ?? song.durationSec;
    if (cue.startSec >= duration) errors.push({ cueId: cue.id, reason: ERR_START });
    else if (cue.endSec != null && cue.endSec > duration) errors.push({ cueId: cue.id, reason: ERR_END });
  }
  return errors;
}

export async function loadShow(
  snap: ShowSnapshot,
  deps: {
    caches: CacheStorage;
    fetch: typeof fetch;
    probe: (blob: Blob) => Promise<number>;
    onProgress: (items: LoadItem[], bytesDone: number, bytesTotal: number) => void;
  },
): Promise<{ ok: boolean; items: LoadItem[]; cueErrors: CueError[] }> {
  const songs = Object.values(snap.songs);
  const items: LoadItem[] = songs.map((s) => ({ songId: s.id, title: s.title, status: "pending" }));
  const bytesTotal = songs.reduce((n, s) => n + s.fileSize, 0);
  let bytesDone = 0;
  const durations: Record<string, number> = {};
  const progress = () => deps.onProgress(items.map((i) => ({ ...i })), bytesDone, bytesTotal);

  const cache = await deps.caches.open(MUSIC_CACHE);

  async function download(song: Song): Promise<Blob> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await deps.fetch(`/api/songs/${song.id}/file`, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`http ${res.status}`);
        return await res.blob();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async function work(index: number): Promise<void> {
    const song = songs[index];
    const item = items[index];
    const fail = (reason: string) => {
      item.status = "error";
      item.reason = reason;
      progress();
    };
    item.status = "downloading";
    progress();

    let blob: Blob | null = null;
    try {
      const hit = await cache.match(cacheKey(song));
      if (hit) {
        blob = await hit.blob();
        bytesDone += song.fileSize;
      }
    } catch {
      blob = null;
    }
    if (!blob) {
      try {
        blob = await download(song);
      } catch {
        return fail(ERR_NETWORK);
      }
      try {
        await cache.put(
          cacheKey(song),
          new Response(blob, { headers: { "content-type": song.mimeType } }),
        );
      } catch {
        return fail(ERR_STORE);
      }
      bytesDone += song.fileSize;
    }

    try {
      durations[song.id] = await deps.probe(blob);
    } catch {
      return fail(ERR_PROBE);
    }
    item.status = "ok";
    progress();
  }

  progress();
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, songs.length) }, async () => {
    while (next < songs.length) await work(next++);
  });
  await Promise.all(workers);

  const cueErrors = validateCueTimes(snap, durations);
  const ok = items.every((i) => i.status === "ok") && cueErrors.length === 0;
  return { ok, items, cueErrors };
}

/** Deletes every cached music entry that does not belong to a kept song. Returns how many were deleted. */
export async function pruneMusicCache(keep: Song[], caches: CacheStorage): Promise<number> {
  const keepKeys = new Set(keep.map(cacheKey));
  const cache = await caches.open(MUSIC_CACHE);
  let deleted = 0;
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (keepKeys.has(u.pathname + u.search)) continue;
    if (await cache.delete(req)) deleted++;
  }
  return deleted;
}

/** Resolves with the audio duration of a blob (seconds); rejects on a decode error or after 15 s. */
export function probeAudio(blob: Blob): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const timer = setTimeout(() => done(() => reject(new Error("timeout"))), 15000);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      fn();
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => done(() => resolve(audio.duration)), { once: true });
    audio.addEventListener("error", () => done(() => reject(new Error("audio error"))), { once: true });
    audio.src = url;
  });
}
