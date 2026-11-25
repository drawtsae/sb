import { asc, eq, inArray, max } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { backgroundTracks, cues, events, songs } from "@/server/db/schema";
import { cueSchema, parseSettings, settingsSchema } from "@/lib/validation";
import type { Cue, EventDetail, EventRecord, EventSettings, Song } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { cueToRow, rowToCue } from "./cue-row";
import { rowToSong } from "./song-row";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export class ValidationError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super("invalid");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

function toIssues(issues: { path: PropertyKey[]; message: string }[]): ValidationIssue[] {
  return issues.map((i) => ({
    path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
    message: i.message,
  }));
}

type EventRow = typeof events.$inferSelect;

function rowToEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate,
    settings: parseSettings(row.settings),
    updatedAt: row.updatedAt,
  };
}

const nowIso = () => new Date().toISOString();

function touch(q: Q, eventId: string): void {
  q.update(events).set({ updatedAt: nowIso() }).where(eq(events.id, eventId)).run();
}

function requireEvent(q: Q, id: string): EventRow {
  const row = q.select().from(events).where(eq(events.id, id)).get();
  if (!row) throw new NotFoundError("event");
  return row;
}

export function listEvents(db: Db): EventRecord[] {
  return db.select().from(events).orderBy(asc(events.name), asc(events.id)).all().map(rowToEvent);
}

export function createEvent(db: Db, name: string): EventRecord {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");
  const id = crypto.randomUUID();
  const now = nowIso();
  db.insert(events)
    .values({ id, name: trimmed, settings: JSON.stringify(DEFAULT_SETTINGS), createdAt: now, updatedAt: now })
    .run();
  return rowToEvent(requireEvent(db, id));
}

export function renameEvent(db: Db, id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");
  requireEvent(db, id);
  db.update(events).set({ name: trimmed, updatedAt: nowIso() }).where(eq(events.id, id)).run();
}

export function updateSettings(db: Db, id: string, s: EventSettings): void {
  const parsed = settingsSchema.safeParse(s);
  if (!parsed.success) throw new ValidationError(toIssues(parsed.error.issues));
  requireEvent(db, id);
  db.update(events)
    .set({ settings: JSON.stringify(parsed.data), updatedAt: nowIso() })
    .where(eq(events.id, id))
    .run();
}

export function deleteEvent(db: Db, id: string): void {
  db.delete(events).where(eq(events.id, id)).run();
}

export function duplicateEvent(db: Db, id: string, newName: string): EventRecord {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("name required");
  const newId = crypto.randomUUID();
  db.transaction((tx) => {
    const src = requireEvent(tx, id);
    const now = nowIso();
    tx.insert(events)
      .values({
        id: newId,
        name: trimmed,
        eventDate: src.eventDate,
        settings: src.settings,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const tracks = tx
      .select()
      .from(backgroundTracks)
      .where(eq(backgroundTracks.eventId, id))
      .orderBy(asc(backgroundTracks.position), asc(backgroundTracks.id))
      .all();
    tracks.forEach((t, i) => {
      tx.insert(backgroundTracks)
        .values({ id: crypto.randomUUID(), eventId: newId, position: i, songId: t.songId })
        .run();
    });
    const srcCues = tx
      .select()
      .from(cues)
      .where(eq(cues.eventId, id))
      .orderBy(asc(cues.position), asc(cues.id))
      .all();
    srcCues.forEach((c, i) => {
      tx.insert(cues)
        .values({ ...c, id: crypto.randomUUID(), eventId: newId, position: i })
        .run();
    });
  });
  return rowToEvent(requireEvent(db, newId));
}

export function getEventDetail(db: Db, id: string): EventDetail | null {
  const row = db.select().from(events).where(eq(events.id, id)).get();
  if (!row) return null;
  const background = db
    .select()
    .from(backgroundTracks)
    .where(eq(backgroundTracks.eventId, id))
    .orderBy(asc(backgroundTracks.position), asc(backgroundTracks.id))
    .all()
    .map((t) => ({ id: t.id, songId: t.songId }));
  const cueList = db
    .select()
    .from(cues)
    .where(eq(cues.eventId, id))
    .orderBy(asc(cues.position), asc(cues.id))
    .all()
    .map(rowToCue);
  const songIds = new Set<string>(background.map((t) => t.songId));
  for (const c of cueList) if (c.songId) songIds.add(c.songId);
  const songMap: Record<string, Song> = {};
  if (songIds.size > 0) {
    for (const s of db.select().from(songs).where(inArray(songs.id, [...songIds])).all()) {
      songMap[s.id] = rowToSong(s);
    }
  }
  return { event: rowToEvent(row), background, cues: cueList, songs: songMap };
}

export function addBackgroundTrack(db: Db, eventId: string, songId: string): { id: string; songId: string } {
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    requireEvent(tx, eventId);
    const m = tx
      .select({ m: max(backgroundTracks.position) })
      .from(backgroundTracks)
      .where(eq(backgroundTracks.eventId, eventId))
      .get();
    tx.insert(backgroundTracks)
      .values({ id, eventId, position: (m?.m ?? -1) + 1, songId })
      .run();
    touch(tx, eventId);
  });
  return { id, songId };
}

export function removeBackgroundTrack(db: Db, trackId: string): void {
  db.transaction((tx) => {
    const t = tx.select().from(backgroundTracks).where(eq(backgroundTracks.id, trackId)).get();
    if (!t) return;
    tx.delete(backgroundTracks).where(eq(backgroundTracks.id, trackId)).run();
    touch(tx, t.eventId);
  });
}

export function reorderBackground(db: Db, eventId: string, ids: string[]): void {
  db.transaction((tx) => {
    requireEvent(tx, eventId);
    const existing = tx
      .select({ id: backgroundTracks.id })
      .from(backgroundTracks)
      .where(eq(backgroundTracks.eventId, eventId))
      .all()
      .map((r) => r.id);
    assertSameIds(existing, ids);
    ids.forEach((tid, i) => {
      tx.update(backgroundTracks).set({ position: i }).where(eq(backgroundTracks.id, tid)).run();
    });
    touch(tx, eventId);
  });
}

function assertSameIds(existing: string[], ids: string[]): void {
  const want = new Set(existing);
  if (ids.length !== want.size || new Set(ids).size !== ids.length || !ids.every((i) => want.has(i))) {
    throw new Error("ids do not match this event");
  }
}

/**
 * Insert (unknown or empty id: a fresh uuid and position max+1) or update in place
 * (position is left alone; use reorderCues to move). Returns the stored cue.
 */
export function upsertCue(db: Db, eventId: string, cue: Cue): Cue {
  const parsed = cueSchema.safeParse(cue);
  if (!parsed.success) throw new ValidationError(toIssues(parsed.error.issues));
  const input = parsed.data as Cue;
  let savedId = input.id;
  db.transaction((tx) => {
    requireEvent(tx, eventId);
    const existing = input.id ? tx.select().from(cues).where(eq(cues.id, input.id)).get() : undefined;
    if (existing) {
      if (existing.eventId !== eventId) throw new Error("cue belongs to another event");
      const { id: _id, eventId: _e, position: _p, ...rest } = cueToRow(eventId, input);
      void _id;
      void _e;
      void _p;
      tx.update(cues).set(rest).where(eq(cues.id, input.id)).run();
    } else {
      const m = tx
        .select({ m: max(cues.position) })
        .from(cues)
        .where(eq(cues.eventId, eventId))
        .get();
      savedId = crypto.randomUUID();
      tx.insert(cues)
        .values(cueToRow(eventId, { ...input, id: savedId, position: (m?.m ?? -1) + 1 }))
        .run();
    }
    touch(tx, eventId);
  });
  return rowToCue(db.select().from(cues).where(eq(cues.id, savedId)).get()!);
}

export function deleteCue(db: Db, cueId: string): void {
  db.transaction((tx) => {
    const c = tx.select().from(cues).where(eq(cues.id, cueId)).get();
    if (!c) return;
    tx.delete(cues).where(eq(cues.id, cueId)).run();
    touch(tx, c.eventId);
  });
}

export function reorderCues(db: Db, eventId: string, ids: string[]): void {
  db.transaction((tx) => {
    requireEvent(tx, eventId);
    const existing = tx
      .select({ id: cues.id })
      .from(cues)
      .where(eq(cues.eventId, eventId))
      .all()
      .map((r) => r.id);
    assertSameIds(existing, ids);
    ids.forEach((cid, i) => {
      tx.update(cues).set({ position: i }).where(eq(cues.id, cid)).run();
    });
    touch(tx, eventId);
  });
}
