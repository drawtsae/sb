// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { events, songs } from "@/server/db/schema";
import { parseExport, toExport, type EventExportV1 } from "@/lib/events/export";
import { importEvent } from "@/server/repo/event-import";
import { addBackgroundTrack, createEvent, getEventDetail, updateSettings, upsertCue } from "@/server/repo/events";
import { DEFAULT_SETTINGS, type Cue } from "@/lib/types";

const now = "2026-01-01T00:00:00.000Z";
const addSong = (db: Db, id: string, hash: string) =>
  db
    .insert(songs)
    .values({
      id, title: "Song " + id, artist: "", durationSec: 60, fileName: id + ".mp3", fileSize: 1,
      mimeType: "audio/mpeg", contentHash: hash, createdAt: now, updatedAt: now,
    })
    .run();

const cue = (over: Partial<Cue> = {}): Cue => ({
  id: "", position: 0, kind: "song", name: "Cue", songId: "s1", startSec: 0, endSec: null,
  fadeInSec: null, fadeOutSec: null, volume: 100, onEnd: "resume_background", note: "", transition: null, ...over,
});

function source() {
  const db = createTestDb();
  addSong(db, "s1", "h1");
  addSong(db, "s2", "h2");
  addSong(db, "s3", "h3");
  const ev = createEvent(db, "Tiệc");
  addBackgroundTrack(db, ev.id, "s2");
  addBackgroundTrack(db, ev.id, "s1");
  addBackgroundTrack(db, ev.id, "s3");
  upsertCue(db, ev.id, cue({ name: "A", songId: "s1" }));
  upsertCue(db, ev.id, cue({ name: "B", kind: "background", songId: null }));
  upsertCue(db, ev.id, cue({ name: "C", songId: "s3" }));
  return { db, ev, data: toExport(getEventDetail(db, ev.id)!) };
}

describe("event export", () => {
  it("round-trips through toExport/parseExport", () => {
    const { data } = source();
    expect(data.songs.map((s) => s.ref).sort()).toEqual(["s1", "s2", "s3"]);
    expect(data.background).toEqual(["s2", "s1", "s3"]);
    expect(data.cues.map((c) => c.position)).toEqual([0, 1, 2]);
    expect(data.cues[0]).not.toHaveProperty("id");
    expect(data.cues[0]).not.toHaveProperty("songId");
    expect(data.cues[0].songRef).toBe("s1");
    expect(parseExport(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(parseExport(JSON.stringify(data))).toEqual(data);
  });

  it("parseExport rejects version 2", () => {
    const { data } = source();
    expect(() => parseExport({ ...data, version: 2 })).toThrow("File không đúng định dạng");
    expect(() => parseExport("not json")).toThrow("File không đúng định dạng");
  });

  it("importEvent converts cue with missing song to background and reports it", () => {
    const { data } = source();
    const target = createTestDb();
    addSong(target, "t1", "h1"); // only h1 exists here
    const { event, missing } = importEvent(target, data);
    const d = getEventDetail(target, event.id)!;
    expect(d.cues.map((c) => [c.name, c.kind, c.songId])).toEqual([
      ["A", "song", "t1"],
      ["B", "background", null],
      ["C (thiếu bài)", "background", null],
    ]);
    expect(d.background.map((b) => b.songId)).toEqual(["t1"]);
    expect(missing.map((m) => m.contentHash).sort()).toEqual(["h2", "h3"]);
    expect(d.cues.every((c) => c.id !== "")).toBe(true);
  });

  it("importEvent preserves background order and settings with all songs present", () => {
    const { data, ev, db } = source();
    const { event, missing } = importEvent(db, data);
    expect(missing).toEqual([]);
    expect(event.id).not.toBe(ev.id);
    const d = getEventDetail(db, event.id)!;
    expect(d.background.map((b) => b.songId)).toEqual(["s2", "s1", "s3"]);
    expect(d.cues.map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect(d.event.settings).toEqual(data.settings);
  });

  it("round-trips transition and defaultTransition", () => {
    const db = createTestDb();
    addSong(db, "s1", "h1");
    const ev = createEvent(db, "T");
    updateSettings(db, ev.id, { ...DEFAULT_SETTINGS, defaultTransition: "fade_out_in" });
    upsertCue(db, ev.id, cue({ transition: "fade_out_in" }));
    const data = parseExport(JSON.stringify(toExport(getEventDetail(db, ev.id)!)));
    const { event } = importEvent(db, data);
    const d = getEventDetail(db, event.id)!;
    expect(d.cues[0].transition).toBe("fade_out_in");
    expect(d.event.settings.defaultTransition).toBe("fade_out_in");
  });

  it("parses a v1 file without transition fields", () => {
    const { data } = source();
    const old = JSON.parse(JSON.stringify(data));
    delete old.settings.defaultTransition;
    for (const c of old.cues) delete c.transition;
    const parsed = parseExport(old);
    expect(parsed.cues.every((c) => c.transition === null)).toBe(true);
    expect(parsed.settings.defaultTransition).toBe("crossfade");
    const db = createTestDb();
    const { event } = importEvent(db, parsed);
    expect(getEventDetail(db, event.id)!.cues[0].transition).toBeNull();
  });

  it("importEvent rolls back on failure", () => {
    const { data } = source();
    const target = createTestDb();
    const bad: EventExportV1 = { ...data, cues: [{ ...data.cues[1], startSec: 5, endSec: 1 }] };
    expect(() => importEvent(target, bad)).toThrow();
    expect(target.select().from(events).all()).toHaveLength(0);
  });
});
