// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDb, getDb, resetDbForTests } from "@/server/db/client";
import { backgroundTracks, cues, events, songs } from "@/server/db/schema";

const now = "2026-01-01T00:00:00.000Z";

function seed(db: ReturnType<typeof createTestDb>) {
  db.insert(songs)
    .values({
      id: "s1",
      title: "Bài hát",
      artist: "Ca sĩ",
      durationSec: 200,
      fileName: "a.mp3",
      fileSize: 1000,
      mimeType: "audio/mpeg",
      contentHash: "h1",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(events)
    .values({ id: "e1", name: "Tiệc", settings: "{}", createdAt: now, updatedAt: now })
    .run();
}

function sqliteCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

const cue = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  eventId: "e1",
  position: 0,
  kind: "song" as const,
  name: "Cue",
  songId: "s1",
  startSec: 0,
  endSec: 10,
  ...over,
});

describe("db schema", () => {
  it("foreign keys are enforced", () => {
    const db = createTestDb();
    seed(db);
    db.insert(cues).values(cue()).run();
    // ON DELETE RESTRICT reports SQLITE_CONSTRAINT_TRIGGER (not _FOREIGNKEY) in SQLite;
    // the message still names the foreign key.
    expect(() => db.delete(songs).where(eq(songs.id, "s1")).run()).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(sqliteCode(() => db.delete(songs).where(eq(songs.id, "s1")).run())).toMatch(
      /^SQLITE_CONSTRAINT_(TRIGGER|FOREIGNKEY)$/,
    );
  });

  it("deleting event cascades cues and background_tracks", () => {
    const db = createTestDb();
    seed(db);
    db.insert(cues).values(cue()).run();
    db.insert(backgroundTracks)
      .values({ id: "b1", eventId: "e1", position: 0, songId: "s1" })
      .run();
    db.delete(events).where(eq(events.id, "e1")).run();
    expect(db.select().from(cues).all()).toHaveLength(0);
    expect(db.select().from(backgroundTracks).all()).toHaveLength(0);
  });

  it("song cue without song_id violates check", () => {
    const db = createTestDb();
    seed(db);
    expect(
      sqliteCode(() => db.insert(cues).values(cue({ songId: null })).run()),
    ).toBe("SQLITE_CONSTRAINT_CHECK");
  });

  it("end_sec <= start_sec violates check", () => {
    const db = createTestDb();
    seed(db);
    expect(
      sqliteCode(() => db.insert(cues).values(cue({ startSec: 5, endSec: 5 })).run()),
    ).toBe("SQLITE_CONSTRAINT_CHECK");
  });
});

describe("getDb", () => {
  const prev = process.env.DATA_DIR;
  afterEach(() => {
    resetDbForTests();
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
  });

  it("getDb creates data dir and music dir", () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sb-")), "data");
    process.env.DATA_DIR = dir;
    const db = getDb();
    expect(fs.existsSync(path.join(dir, "app.db"))).toBe(true);
    expect(fs.statSync(path.join(dir, "music")).isDirectory()).toBe(true);
    expect(getDb()).toBe(db);
    expect(db.select().from(songs).all()).toEqual([]);
  });
});
