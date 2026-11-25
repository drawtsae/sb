// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  MUSIC_CACHE, cacheKey, getCachedBlob, loadShow, pruneMusicCache, validateCueTimes, type LoadItem,
} from "@/lib/offline/music-cache";
import { DEFAULT_SETTINGS, type Cue, type ShowSnapshot, type Song } from "@/lib/types";

function fakeCaches(): CacheStorage {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (k: string) => m.get(k)?.clone(),
      put: async (k: string, r: Response) => void m.set(k, r),
      delete: async (k: string | Request) => {
        if (typeof k === "string") return m.delete(k);
        const u = new URL(k.url);
        return m.delete(u.pathname + u.search);
      },
      keys: async () => [...m.keys()].map((u) => new Request("http://x" + u)),
    } as unknown as Cache;
  };
  return { open } as unknown as CacheStorage;
}

const song = (id: string, over: Partial<Song> = {}): Song => ({
  id, folderId: null, title: id, artist: null, durationSec: 30, fileName: `${id}.mp3`,
  fileSize: 100, mimeType: "audio/mpeg", contentHash: `h-${id}`, ...over,
});
const cue = (id: string, songId: string | null, over: Partial<Cue> = {}): Cue => ({
  id, position: 0, kind: songId ? "song" : "background", name: `Cue ${id}`, songId, startSec: 0, endSec: null,
  fadeInSec: null, fadeOutSec: null, volume: 100, onEnd: "stop", note: "", ...over,
});
const snapOf = (songs: Song[], cues: Cue[]): ShowSnapshot => ({
  version: 1, eventId: "e", eventName: "E", takenAt: "t", settings: DEFAULT_SETTINGS,
  songs: Object.fromEntries(songs.map((s) => [s.id, s])), background: [], cues,
});
const okFetch = () => vi.fn(async () => new Response(new Blob(["abc"]), { status: 200 }));
const deps = (caches: CacheStorage, fetchFn: unknown, probe: (b: Blob) => Promise<number> = async () => 30) => ({
  caches, fetch: fetchFn as typeof fetch, probe, onProgress: vi.fn(),
});

describe("loadShow", () => {
  it("cached song with same hash is not re-downloaded", async () => {
    const caches = fakeCaches();
    const s = song("a");
    const f1 = okFetch();
    await loadShow(snapOf([s], []), deps(caches, f1));
    expect(f1).toHaveBeenCalledTimes(1);
    expect(f1).toHaveBeenCalledWith("/api/songs/a/file", { credentials: "same-origin" });
    const f2 = okFetch();
    const d = deps(caches, f2);
    const r = await loadShow(snapOf([s], []), d);
    expect(f2).toHaveBeenCalledTimes(0);
    expect(r.ok).toBe(true);
    const last = d.onProgress.mock.calls.at(-1)!;
    expect(last[1]).toBe(100); // cache hit counts its full size
    expect(last[2]).toBe(100);
  });

  it("changed hash re-downloads", async () => {
    const caches = fakeCaches();
    await loadShow(snapOf([song("a")], []), deps(caches, okFetch()));
    const f = okFetch();
    await loadShow(snapOf([song("a", { contentHash: "new" })], []), deps(caches, f));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rejects startSec beyond duration", async () => {
    const s = song("a", { durationSec: 30 });
    const r = await loadShow(snapOf([s], [cue("c1", "a", { startSec: 40 })]), deps(fakeCaches(), okFetch(), async () => 30));
    expect(r.cueErrors).toEqual([{ cueId: "c1", reason: "Giây bắt đầu vượt quá độ dài bài" }]);
    expect(r.ok).toBe(false);
  });

  it("fetch failing 3 times yields error item and ok=false", async () => {
    const f = vi.fn(async () => { throw new TypeError("net"); });
    const r = await loadShow(snapOf([song("a")], []), deps(fakeCaches(), f));
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.items[0]).toMatchObject({ songId: "a", status: "error", reason: "Không tải được bài (lỗi mạng)" });
    expect(r.ok).toBe(false);
  });

  it("recovers when a retry succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n < 3 ? new Response("x", { status: 500 }) : new Response(new Blob(["abc"]))));
    const r = await loadShow(snapOf([song("a")], []), deps(fakeCaches(), f));
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.ok).toBe(true);
  });

  it("probe failure marks the item as not playable", async () => {
    const r = await loadShow(snapOf([song("a")], []), deps(fakeCaches(), okFetch(), async () => { throw new Error("bad"); }));
    expect(r.items[0]).toMatchObject({ status: "error", reason: "File không phát được" });
    expect(r.ok).toBe(false);
  });

  it("background-kind cue without song is not an error", async () => {
    const r = await loadShow(snapOf([], [cue("c1", null, { startSec: 999 })]), deps(fakeCaches(), okFetch()));
    expect(r.cueErrors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("limits concurrency to 3", async () => {
    let active = 0;
    let peak = 0;
    const f = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response(new Blob(["abc"]));
    });
    const songs = ["a", "b", "c", "d", "e", "f"].map((i) => song(i));
    const r = await loadShow(snapOf(songs, []), deps(fakeCaches(), f));
    expect(r.ok).toBe(true);
    expect(peak).toBe(3);
  });

  it("reports progress through item states", async () => {
    const d = deps(fakeCaches(), okFetch());
    await loadShow(snapOf([song("a")], []), d);
    const statuses = d.onProgress.mock.calls.map((c) => (c[0] as LoadItem[])[0].status);
    expect(statuses).toContain("downloading");
    expect(statuses.at(-1)).toBe("ok");
  });
});

describe("validateCueTimes", () => {
  it("probed duration overrides durationSec", () => {
    const snap = snapOf([song("a", { durationSec: 30 })], [cue("c1", "a", { startSec: 40 }), cue("c2", "a", { endSec: 50 })]);
    expect(validateCueTimes(snap, { a: 60 })).toEqual([]);
    expect(validateCueTimes(snap, { a: 20 })).toEqual([
      { cueId: "c1", reason: "Giây bắt đầu vượt quá độ dài bài" },
      { cueId: "c2", reason: "Giây kết thúc vượt quá độ dài bài" },
    ]);
  });

  it("flags song cues whose song is missing", () => {
    expect(validateCueTimes(snapOf([], [cue("c1", "gone", { kind: "song" })]))).toEqual([
      { cueId: "c1", reason: "Bài không còn trong kho" },
    ]);
  });
});

describe("music cache", () => {
  it("getCachedBlob returns the blob or null", async () => {
    const caches = fakeCaches();
    const s = song("a");
    expect(await getCachedBlob(s, caches)).toBeNull();
    await loadShow(snapOf([s], []), deps(caches, okFetch()));
    const blob = await getCachedBlob(s, caches);
    expect(await blob!.text()).toBe("abc");
    expect(blob!.type).toBe("audio/mpeg");
  });

  it("pruneMusicCache removes keys for songs not kept", async () => {
    const caches = fakeCaches();
    const [a, b] = [song("a"), song("b")];
    await loadShow(snapOf([a, b], []), deps(caches, okFetch()));
    expect(await pruneMusicCache([a], caches)).toBe(1);
    const keys = (await (await caches.open(MUSIC_CACHE)).keys()).map((r) => {
      const u = new URL(r.url);
      return u.pathname + u.search;
    });
    expect(keys).toEqual([cacheKey(a)]);
  });
});
