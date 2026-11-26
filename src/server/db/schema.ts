import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const users = sqliteTable("users", {
  id: id(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  isAdmin: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: text()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// `id` stores the SHA-256 hex of the session token, never the token itself.
export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text().notNull(),
});

export const folders = sqliteTable("folders", {
  id: id(),
  name: text().notNull(),
  parentId: text().references((): AnySQLiteColumn => folders.id, {
    onDelete: "restrict",
  }),
});

export const songs = sqliteTable(
  "songs",
  {
    id: id(),
    folderId: text().references(() => folders.id, { onDelete: "set null" }),
    title: text().notNull(),
    artist: text().notNull().default(""),
    durationSec: real().notNull(),
    fileName: text().notNull(),
    fileSize: integer().notNull(),
    mimeType: text().notNull(),
    contentHash: text().notNull(),
    // Lowercased NFC `title + ' ' + artist`. SQLite LOWER() is ASCII-only,
    // so Vietnamese search needs this precomputed column.
    searchText: text().notNull().default(""),
    createdAt: text()
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text()
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("songs_content_hash_idx").on(t.contentHash)],
);

export const events = sqliteTable("events", {
  id: id(),
  name: text().notNull(),
  eventDate: text(),
  settings: text().notNull().default("{}"),
  createdAt: text()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text()
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const backgroundTracks = sqliteTable("background_tracks", {
  id: id(),
  eventId: text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  songId: text()
    .notNull()
    .references(() => songs.id, { onDelete: "restrict" }),
});

export const cues = sqliteTable(
  "cues",
  {
    id: id(),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    kind: text({ enum: ["song", "background"] }).notNull(),
    name: text().notNull(),
    songId: text().references(() => songs.id, { onDelete: "restrict" }),
    startSec: real().notNull().default(0),
    endSec: real(),
    fadeInSec: real(),
    fadeOutSec: real(),
    volume: integer().notNull().default(100),
    onEnd: text({ enum: ["resume_background", "stop"] })
      .notNull()
      .default("resume_background"),
    note: text().notNull().default(""),
    transition: text({ enum: ["crossfade", "fade_out_in"] }),
  },
  (t) => [
    check("cues_volume_check", sql`${t.volume} BETWEEN 0 AND 100`),
    check("cues_kind_check", sql`${t.kind} IN ('song','background')`),
    check("cues_on_end_check", sql`${t.onEnd} IN ('resume_background','stop')`),
    check("cues_song_id_check", sql`${t.kind} <> 'song' OR ${t.songId} IS NOT NULL`),
    check("cues_end_after_start_check", sql`${t.endSec} IS NULL OR ${t.endSec} > ${t.startSec}`),
    check("cues_start_check", sql`${t.startSec} >= 0`),
    check("cues_transition_check", sql`${t.transition} IS NULL OR ${t.transition} IN ('crossfade','fade_out_in')`),
  ],
);
