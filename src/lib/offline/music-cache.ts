import type { ShowSnapshot, Song } from "@/lib/types";

export const MUSIC_CACHE = "sb-music-v1";

export const ERR_NETWORK = "Không tải được bài (lỗi mạng)";
export const ERR_PROBE = "File không phát được";
export const ERR_START = "Giây bắt đầu vượt quá độ dài bài";
export const ERR_END = "Giây kết thúc vượt quá độ dài bài";
export const ERR_MISSING = "Bài không còn trong kho";
export const ERR_SESSION = "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại";
const ERR_STORE = "Không lưu được bài vào bộ nhớ trình duyệt";

const CONCURRENCY = 3;
const RETRIES = 2;
const BACKOFF_MS = [500, 1500];
const END_TOLERANCE_SEC = 1;

class DownloadError extends Error {
  constructor(public reason: string, public retry: boolean) {
    super(reason);
  }
}

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
    const probed = durations[song.id];
    const d = Number.isFinite(probed) && probed > 0 ? probed : song.durationSec;
    if (cue.startSec >= Math.min(d, song.durationSec)) errors.push({ cueId: cue.id, reason: ERR_START });
    else if (cue.endSec != null && cue.endSec > Math.max(d, song.durationSec) + END_TOLERANCE_SEC) {
      errors.push({ cueId: cue.id, reason: ERR_END });
    }
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
    /** Delay between retries; injectable so tests stay fast. */
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ ok: boolean; items: LoadItem[]; cueErrors: CueError[] }> {
  const songs = Object.values(snap.songs);
  const items: LoadItem[] = songs.map((s) => ({ songId: s.id, title: s.title, status: "pending" }));
  const bytesTotal = songs.reduce((n, s) => n + s.fileSize, 0);
  let bytesDone = 0;
  const durations: Record<string, number> = {};
  const progress = () => deps.onProgress(items.map((i) => ({ ...i })), bytesDone, bytesTotal);

  const cache = await deps.caches.open(MUSIC_CACHE);

  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** Returns a blob of exactly song.fileSize bytes, or throws DownloadError with the reason to show. */
  async function download(song: Song): Promise<Blob> {
    let err = new DownloadError(ERR_NETWORK, true);
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
      try {
        const res = await deps.fetch(`/api/songs/${song.id}/file`, { credentials: "same-origin" });
        if (res.status === 401) throw new DownloadError(ERR_SESSION, false);
        if (res.status === 404) throw new DownloadError(ERR_MISSING, false);
        if (!res.ok) throw new DownloadError(ERR_NETWORK, true);
        const blob = await res.blob();
        if (blob.size !== song.fileSize) throw new DownloadError(ERR_NETWORK, true);
        return blob;
      } catch (e) {
        err = e instanceof DownloadError ? e : new DownloadError(ERR_NETWORK, true);
        if (!err.retry) break;
      }
    }
    throw err;
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
        const cached = await hit.blob();
        if (cached.size === song.fileSize) {
          blob = cached;
          bytesDone += song.fileSize;
        } else {
          await cache.delete(cacheKey(song)); // truncated or corrupt entry: repair it
        }
      }
    } catch {
      blob = null;
    }
    if (!blob) {
      try {
        blob = await download(song);
      } catch (e) {
        return fail(e instanceof DownloadError ? e.reason : ERR_NETWORK);
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
    audio.addEventListener(
      "loadedmetadata",
      () =>
        done(() => {
          const d = audio.duration;
          if (Number.isFinite(d) && d > 0) resolve(d);
          else reject(new Error("bad duration"));
        }),
      { once: true },
    );
    audio.addEventListener("error", () => done(() => reject(new Error("audio error"))), { once: true });
    audio.src = url;
  });
}
