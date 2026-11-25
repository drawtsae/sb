// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/offline/snapshot";
import { DEFAULT_SETTINGS, type Cue, type EventDetail, type Song } from "@/lib/types";

const song = (id: string): Song => ({
  id, folderId: null, title: id, artist: null, durationSec: 30, fileName: `${id}.mp3`,
  fileSize: 1000, mimeType: "audio/mpeg", contentHash: `h-${id}`,
});
const cue = (id: string, position: number, songId: string | null): Cue => ({
  id, position, kind: songId ? "song" : "background", name: id, songId, startSec: 0, endSec: null,
  fadeInSec: null, fadeOutSec: null, volume: 100, onEnd: "stop", note: "",
});

describe("buildSnapshot", () => {
  it("includes only referenced songs and keeps cue order", () => {
    const detail: EventDetail = {
      event: { id: "e1", name: "Tiệc", eventDate: null, settings: DEFAULT_SETTINGS, updatedAt: "x" },
      background: [{ id: "b1", songId: "s2" }, { id: "b2", songId: "s1" }],
      cues: [cue("c1", 0, null), cue("c2", 1, "s3")],
      songs: { s1: song("s1"), s2: song("s2"), s3: song("s3"), unused: song("unused") },
    };
    const now = new Date("2026-11-26T10:00:00Z");
    const snap = buildSnapshot(detail, now);
    expect(snap.version).toBe(1);
    expect(snap.eventId).toBe("e1");
    expect(snap.eventName).toBe("Tiệc");
    expect(snap.takenAt).toBe(now.toISOString());
    expect(snap.background).toEqual(["s2", "s1"]);
    expect(snap.cues.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(Object.keys(snap.songs).sort()).toEqual(["s1", "s2", "s3"]);
    expect(snap.settings).toEqual(DEFAULT_SETTINGS);
  });
});
