// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import { songs } from "@/server/db/schema";
import type { Cue } from "@/lib/types";
import {
  addBackgroundTrack,
  createEvent,
  deleteCue,
  deleteEvent,
  duplicateEvent,
  getEventDetail,
  listEvents,
  removeBackgroundTrack,
  renameEvent,
  reorderBackground,
  reorderCues,
  updateSettings,
  upsertCue,
  ValidationError,
} from "@/server/repo/events";

const now = "2026-01-01T00:00:00.000Z";

function setup() {
  const db = createTestDb();
  for (const id of ["s1", "s2"]) {
    db.insert(songs)
      .values({
        id,
        title: "Song " + id,
        artist: "",
        durationSec: 60,
        fileName: id + ".mp3",
        fileSize: 1,
        mimeType: "audio/mpeg",
        contentHash: "h" + id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  return db;
}

const cue = (over: Partial<Cue> = {}): Cue => ({
  id: "",
  position: 0,
  kind: "song",
  name: "Cue",
  songId: "s1",
  startSec: 0,
  endSec: null,
  fadeInSec: null,
  fadeOutSec: null,
  volume: 100,
  onEnd: "resume_background",
  note: "",
  transition: null,
  ...over,
});

describe("cue transition", () => {
  it("round-trips fade_out_in and null", () => {
    const db = setup();
    const ev = createEvent(db, "T");
    upsertCue(db, ev.id, cue({ name: "A", transition: "fade_out_in" }));
    upsertCue(db, ev.id, cue({ name: "B", transition: null }));
    const d = getEventDetail(db, ev.id)!;
    expect(d.cues.map((c) => c.transition)).toEqual(["fade_out_in", null]);
  });
  it("rejects an unknown transition at the CHECK constraint", () => {
    const db = setup();
    const ev = createEvent(db, "T");
    upsertCue(db, ev.id, cue());
    let code: unknown;
    try {
      db.run(sql`UPDATE cues SET transition = 'instant'`);
    } catch (e) {
      code = ((e as { cause?: { code?: string } }).cause ?? e as { code?: string }).code;
    }
    expect(code).toBe("SQLITE_CONSTRAINT_CHECK");
  });
});

function populate(db: Db) {
  const ev = createEvent(db, "Tiệc");
  const t1 = addBackgroundTrack(db, ev.id, "s1");
  const t2 = addBackgroundTrack(db, ev.id, "s2");
  const c1 = upsertCue(db, ev.id, cue({ name: "A" }));
  const c2 = upsertCue(db, ev.id, cue({ name: "B", kind: "background", songId: null }));
  return { ev, t1, t2, c1, c2 };
}

describe("events repo", () => {
  it("creates, lists, renames and deletes events", () => {
    const db = setup();
    const ev = createEvent(db, "Một");
    expect(ev.settings.cueFadeSec).toBe(3);
    renameEvent(db, ev.id, "Hai");
    expect(listEvents(db).map((e) => e.name)).toEqual(["Hai"]);
    deleteEvent(db, ev.id);
    expect(listEvents(db)).toEqual([]);
    expect(getEventDetail(db, ev.id)).toBeNull();
  });

  it("duplicateEvent copies cues and background in order", () => {
    const db = setup();
    const { ev } = populate(db);
    updateSettings(db, ev.id, { ...ev.settings, cueFadeSec: 5 });
    const copy = duplicateEvent(db, ev.id, "Bản sao");
    expect(copy.id).not.toBe(ev.id);
    expect(copy.settings.cueFadeSec).toBe(5);
    const a = getEventDetail(db, ev.id)!;
    const b = getEventDetail(db, copy.id)!;
    expect(b.cues.map((c) => c.name)).toEqual(["A", "B"]);
    expect(b.background.map((t) => t.songId)).toEqual(["s1", "s2"]);
    expect(b.cues.map((c) => c.position)).toEqual([0, 1]);
    const ids = new Set([...a.cues.map((c) => c.id), ...a.background.map((t) => t.id)]);
    for (const x of [...b.cues.map((c) => c.id), ...b.background.map((t) => t.id)]) {
      expect(ids.has(x)).toBe(false);
    }
  });

  it("getEventDetail returns ordered children and referenced songs", () => {
    const db = setup();
    const { ev } = populate(db);
    const d = getEventDetail(db, ev.id)!;
    expect(d.background.map((t) => t.songId)).toEqual(["s1", "s2"]);
    expect(Object.keys(d.songs).sort()).toEqual(["s1", "s2"]);
    expect(d.cues[1]).toMatchObject({ kind: "background", songId: null, fadeInSec: null });
    expect(getEventDetail(db, "nope")).toBeNull();
  });

  it("reorderCues sets positions to array index", () => {
    const db = setup();
    const { ev, c1, c2 } = populate(db);
    const c3 = upsertCue(db, ev.id, cue({ name: "C" }));
    reorderCues(db, ev.id, [c3.id, c1.id, c2.id]);
    const d = getEventDetail(db, ev.id)!;
    expect(d.cues.map((c) => [c.name, c.position])).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2],
    ]);
  });

  it("reorder rejects ids from another event and rolls back", () => {
    const db = setup();
    const { ev, c1, c2, t1, t2 } = populate(db);
    const other = createEvent(db, "Khác");
    const oc = upsertCue(db, other.id, cue({ name: "X" }));
    expect(() => reorderCues(db, ev.id, [c2.id, oc.id])).toThrow();
    expect(() => reorderCues(db, ev.id, [c2.id])).toThrow();
    expect(getEventDetail(db, ev.id)!.cues.map((c) => c.id)).toEqual([c1.id, c2.id]);
    reorderBackground(db, ev.id, [t2.id, t1.id]);
    expect(getEventDetail(db, ev.id)!.background.map((t) => t.id)).toEqual([t2.id, t1.id]);
    expect(() => reorderBackground(db, ev.id, [t1.id, "zzz"])).toThrow();
  });

  it("upsertCue rejects invalid cue via cueSchema", () => {
    const db = setup();
    const ev = createEvent(db, "E");
    let err: unknown;
    try {
      upsertCue(db, ev.id, cue({ songId: null }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).issues[0].path).toEqual(["songId"]);
    expect(getEventDetail(db, ev.id)!.cues).toEqual([]);
  });

  it("upsertCue inserts with max+1 position and updates in place", () => {
    const db = setup();
    const { ev, c1, c2 } = populate(db);
    expect([c1.position, c2.position]).toEqual([0, 1]);
    const upd = upsertCue(db, ev.id, { ...c1, name: "A2", fadeInSec: 2.5 });
    expect(upd.id).toBe(c1.id);
    const d = getEventDetail(db, ev.id)!;
    expect(d.cues[0]).toMatchObject({ name: "A2", fadeInSec: 2.5, fadeOutSec: null, position: 0 });
    expect(d.cues).toHaveLength(2);
  });

  it("deleteCue and removeBackgroundTrack delete rows", () => {
    const db = setup();
    const { ev, c1, t1 } = populate(db);
    deleteCue(db, c1.id);
    removeBackgroundTrack(db, t1.id);
    const d = getEventDetail(db, ev.id)!;
    expect(d.cues).toHaveLength(1);
    expect(d.background).toHaveLength(1);
  });

  it("deleteCue and removeBackgroundTrack ignore ids from another event", () => {
    const db = setup();
    const { ev, c1, t1 } = populate(db);
    const other = createEvent(db, "Khác");
    deleteCue(db, c1.id, other.id);
    removeBackgroundTrack(db, t1.id, other.id);
    const d = getEventDetail(db, ev.id)!;
    expect(d.cues).toHaveLength(2);
    expect(d.background).toHaveLength(2);
    deleteCue(db, c1.id, ev.id);
    removeBackgroundTrack(db, t1.id, ev.id);
    expect(getEventDetail(db, ev.id)!.cues).toHaveLength(1);
    expect(getEventDetail(db, ev.id)!.background).toHaveLength(1);
  });

  it("every mutation bumps events.updated_at", async () => {
    const db = setup();
    const ev = createEvent(db, "E");
    const stamp = () => getEventDetail(db, ev.id)!.event.updatedAt;
    let prev = stamp();
    const step = async (fn: () => void) => {
      await new Promise((r) => setTimeout(r, 5));
      fn();
      const cur = stamp();
      expect(cur > prev).toBe(true);
      prev = cur;
    };
    await step(() => renameEvent(db, ev.id, "F"));
    await step(() => updateSettings(db, ev.id, ev.settings));
    let t!: { id: string };
    await step(() => (t = addBackgroundTrack(db, ev.id, "s1")));
    let c!: Cue;
    await step(() => (c = upsertCue(db, ev.id, cue())));
    await step(() => reorderCues(db, ev.id, [c.id]));
    await step(() => reorderBackground(db, ev.id, [t.id]));
    await step(() => deleteCue(db, c.id));
    await step(() => removeBackgroundTrack(db, t.id));
  });
});
