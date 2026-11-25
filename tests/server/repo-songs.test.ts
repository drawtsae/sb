// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/server/db/client";
import { backgroundTracks, cues, events, songs } from "@/server/db/schema";
import { searchTextFor } from "@/server/repo/song-row";
import {
  deleteSong,
  libraryUsage,
  listSongs,
  SongInUseError,
  songUsage,
  updateSong,
} from "@/server/repo/songs";
import {
  createFolder,
  deleteFolder,
  FolderNotEmptyError,
  listFolders,
  moveFolder,
  renameFolder,
} from "@/server/repo/folders";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-repo-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let db: Db;
beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(root, "data-"));
  fs.mkdirSync(path.join(process.env.DATA_DIR, "music"), { recursive: true });
  db = createTestDb();
});

function addSong(id: string, title: string, artist = "", folderId: string | null = null, size = 100) {
  db.insert(songs)
    .values({
      id,
      folderId,
      title,
      artist,
      durationSec: 10,
      fileName: `${id}.mp3`,
      fileSize: size,
      mimeType: "audio/mpeg",
      contentHash: `h-${id}`,
      searchText: searchTextFor(title, artist || null),
    })
    .run();
  fs.writeFileSync(path.join(process.env.DATA_DIR!, "music", `${id}.mp3`), "x");
}
const addEvent = (id: string, name: string) =>
  db.insert(events).values({ id, name, settings: "{}" }).run();

describe("songs repo", () => {
  it("deleteSong throws SongInUseError listing event names", async () => {
    addSong("s1", "A");
    addEvent("e1", "Tiệc cưới");
    addEvent("e2", "Tiệc khác");
    db.insert(backgroundTracks).values({ eventId: "e1", position: 0, songId: "s1" }).run();
    db.insert(cues)
      .values([
        { eventId: "e1", position: 0, kind: "song", name: "c", songId: "s1" },
        { eventId: "e2", position: 0, kind: "song", name: "c", songId: "s1" },
      ])
      .run();
    const err = await deleteSong(db, "s1").catch((e) => e);
    expect(err).toBeInstanceOf(SongInUseError);
    expect(err.usage.map((u: { eventName: string }) => u.eventName).sort()).toEqual([
      "Tiệc cưới",
      "Tiệc khác",
    ]);
    expect(songUsage(db, "s1")).toHaveLength(2); // distinct events
    expect(listSongs(db)).toHaveLength(1);
  });

  it("deleteSong removes file from disk", async () => {
    addSong("s1", "A");
    const file = path.join(process.env.DATA_DIR!, "music", "s1.mp3");
    await deleteSong(db, "s1");
    expect(fs.existsSync(file)).toBe(false);
    expect(listSongs(db)).toHaveLength(0);
  });

  it("deleteSong tolerates an already-missing file", async () => {
    addSong("s1", "A");
    fs.rmSync(path.join(process.env.DATA_DIR!, "music", "s1.mp3"));
    await expect(deleteSong(db, "s1")).resolves.toBeUndefined();
    expect(listSongs(db)).toHaveLength(0);
  });

  it("listSongs search is case-insensitive for Vietnamese", () => {
    addSong("s1", "Đám cưới", "Ca sĩ");
    addSong("s2", "Khác");
    expect(listSongs(db, { search: "đám" }).map((s) => s.id)).toEqual(["s1"]);
    expect(listSongs(db, { search: "ĐÁM" }).map((s) => s.id)).toEqual(["s1"]);
    expect(listSongs(db, { search: "ca sĩ" }).map((s) => s.id)).toEqual(["s1"]);
  });

  it("listSongs escapes LIKE wildcards", () => {
    addSong("s1", "100% hay");
    addSong("s2", "abc");
    expect(listSongs(db, { search: "%" }).map((s) => s.id)).toEqual(["s1"]);
    expect(listSongs(db, { search: "_" })).toHaveLength(0);
  });

  it("listSongs filters by folder: undefined = all, null = root", () => {
    const f = createFolder(db, "F", null);
    addSong("s1", "A", "", f.id);
    addSong("s2", "B");
    expect(listSongs(db)).toHaveLength(2);
    expect(listSongs(db, { folderId: f.id }).map((s) => s.id)).toEqual(["s1"]);
    expect(listSongs(db, { folderId: null }).map((s) => s.id)).toEqual(["s2"]);
  });

  it("updateSong refreshes searchText and updatedAt, and validates title", () => {
    addSong("s1", "Old", "X");
    const before = db.select().from(songs).get()!;
    const s = updateSong(db, "s1", { title: "  Đêm  ", artist: "" });
    expect(s.title).toBe("Đêm");
    expect(s.artist).toBeNull();
    expect(listSongs(db, { search: "đêm" })).toHaveLength(1);
    expect(listSongs(db, { search: "old" })).toHaveLength(0);
    const after = db.select().from(songs).get()!;
    expect(after.artist).toBe("");
    expect(after.updatedAt >= before.updatedAt).toBe(true);
    expect(() => updateSong(db, "s1", { title: "   " })).toThrow();
  });

  it("updateSong can move to a folder", () => {
    const f = createFolder(db, "F", null);
    addSong("s1", "A");
    expect(updateSong(db, "s1", { folderId: f.id }).folderId).toBe(f.id);
    expect(updateSong(db, "s1", { folderId: null }).folderId).toBeNull();
  });

  it("libraryUsage sums file sizes and reports free disk", async () => {
    addSong("s1", "A", "", null, 100);
    addSong("s2", "B", "", null, 250);
    const u = await libraryUsage(db);
    expect(u.musicBytes).toBe(350);
    expect(u.diskFreeBytes === null || u.diskFreeBytes > 0).toBe(true);
  });
});

describe("folders repo", () => {
  it("moveFolder rejects moving into own descendant", () => {
    const a = createFolder(db, "A", null);
    const b = createFolder(db, "B", a.id);
    const c = createFolder(db, "C", b.id);
    expect(() => moveFolder(db, a.id, c.id)).toThrow(/cycle|descendant/i);
    expect(() => moveFolder(db, a.id, a.id)).toThrow();
    expect(moveFolder(db, c.id, null).parentId).toBeNull();
    expect(moveFolder(db, b.id, null).parentId).toBeNull();
  });

  it("deleteFolder throws when not empty", () => {
    const a = createFolder(db, "A", null);
    const b = createFolder(db, "B", a.id);
    expect(() => deleteFolder(db, a.id)).toThrow(FolderNotEmptyError);
    addSong("s1", "S", "", b.id);
    expect(() => deleteFolder(db, b.id)).toThrow(FolderNotEmptyError);
    updateSong(db, "s1", { folderId: null });
    deleteFolder(db, b.id);
    deleteFolder(db, a.id);
    expect(listFolders(db)).toHaveLength(0);
  });

  it("renameFolder trims and rejects empty names", () => {
    const a = createFolder(db, "A", null);
    expect(renameFolder(db, a.id, " Z ").name).toBe("Z");
    expect(() => renameFolder(db, a.id, " ")).toThrow();
    expect(() => createFolder(db, "", null)).toThrow();
  });
});
