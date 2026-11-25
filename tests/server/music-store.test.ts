// @vitest-environment node
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { writeGarbage, writeToneWav } from "../../scripts/make-fixtures";
import { createTestDb, type Db } from "@/server/db/client";
import { songs } from "@/server/db/schema";
import {
  deleteSongFile,
  musicPath,
  replaceSongFile,
  storeUpload,
  titleFromFilename,
  UploadError,
} from "@/server/music/store";
import { sha256Hex } from "@/lib/library/hash";

let root: string;
let tone: string;
let tone2: string;
let garbage: string;
let db: Db;
const MAX = 10 * 1024 * 1024;

const bodyOf = (file: string) =>
  Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream<Uint8Array>;
const musicDir = () => path.join(process.env.DATA_DIR!, "music");

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-music-"));
  tone = path.join(root, "tone.wav");
  tone2 = path.join(root, "tone2.wav");
  garbage = path.join(root, "garbage.mp3");
  writeToneWav(tone, 440, 1.5);
  writeToneWav(tone2, 660, 1);
  writeGarbage(garbage, 4096);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(root, "data-"));
  fs.mkdirSync(musicDir(), { recursive: true });
  db = createTestDb();
});

const upload = (file: string, originalName: string, maxBytes = MAX) =>
  storeUpload(db, { body: bodyOf(file), originalName, folderId: null, maxBytes });
const replaceInput = (file: string, originalName: string) => ({
  body: bodyOf(file),
  originalName,
  folderId: null,
  maxBytes: MAX,
});

describe("music store", () => {
  it("falls back to filename when tags empty (NFC)", async () => {
    const nfd = "Đám Cưới Nhé.wav".normalize("NFD");
    const s = await upload(tone, nfd);
    expect(s.title).toBe("Đám Cưới Nhé".normalize("NFC"));
    expect(s.artist).toBeNull();
    expect(s.durationSec).toBeGreaterThan(1.4);
    expect(s.mimeType).toBe("audio/wav");
    expect(titleFromFilename(nfd)).toBe("Đám Cưới Nhé".normalize("NFC"));
  });

  it("stored file name is ascii", async () => {
    const s = await upload(tone, "Đám Cưới.wav");
    expect(s.fileName).toMatch(/^[0-9a-f-]{36}\.wav$/);
    expect(fs.existsSync(musicPath(s.fileName))).toBe(true);
  });

  it("rejects .flac as unsupported_type", async () => {
    await expect(upload(tone, "x.flac")).rejects.toMatchObject({ reason: "unsupported_type" });
    expect(fs.readdirSync(musicDir())).toEqual([]);
  });

  it("rejects oversize and deletes temp file", async () => {
    const p = upload(tone, "a.wav", 1000);
    await expect(p).rejects.toBeInstanceOf(UploadError);
    await expect(p).rejects.toMatchObject({ reason: "too_large" });
    expect(fs.readdirSync(musicDir())).toEqual([]);
  });

  it("rejects unreadable audio and leaves no file", async () => {
    await expect(upload(garbage, "g.mp3")).rejects.toMatchObject({ reason: "unreadable" });
    expect(fs.readdirSync(musicDir())).toEqual([]);
    expect(db.select().from(songs).all()).toHaveLength(0);
  });

  it("content hash equals sha256 of bytes", async () => {
    const s = await upload(tone, "a.wav");
    const expected = createHash("sha256").update(fs.readFileSync(tone)).digest("hex");
    expect(s.contentHash).toBe(expected);
    expect(s.fileSize).toBe(fs.statSync(tone).size);
  });

  it("populates search_text", async () => {
    const s = await upload(tone, "Đám Cưới.wav");
    const row = db.select().from(songs).all()[0];
    expect(row.id).toBe(s.id);
    expect(row.searchText).toBe("đám cưới");
  });

  it("musicPath rejects traversal", () => {
    expect(() => musicPath("../x")).toThrow();
    expect(() => musicPath("a/b.wav")).toThrow();
    expect(() => musicPath("a\\b.wav")).toThrow();
    expect(musicPath("ok.wav")).toBe(path.join(path.resolve(musicDir()), "ok.wav"));
  });

  it("replaceSongFile keeps id, updates hash; failures keep the old file", async () => {
    const s = await upload(tone, "a.wav");
    const oldPath = musicPath(s.fileName);
    const r = await replaceSongFile(db, s.id, replaceInput(tone2, "b.wav"));
    expect(r.id).toBe(s.id);
    expect(r.contentHash).not.toBe(s.contentHash);
    expect(r.contentHash).toBe(createHash("sha256").update(fs.readFileSync(tone2)).digest("hex"));
    expect(r.fileName).toBe(s.fileName);
    await expect(replaceSongFile(db, s.id, replaceInput(garbage, "g.mp3"))).rejects.toMatchObject({
      reason: "unreadable",
    });
    expect(fs.existsSync(oldPath)).toBe(true);
    expect(fs.readdirSync(musicDir())).toEqual([s.fileName]);
    await expect(replaceSongFile(db, "nope", replaceInput(tone, "a.wav"))).rejects.toThrow();
    expect(fs.readdirSync(musicDir())).toEqual([s.fileName]);
  });

  it("replaceSongFile keeps a user-edited title, artist and search_text", async () => {
    const s = await upload(tone, "a.wav");
    db.update(songs)
      .set({ title: "Tên Mới", artist: "Ca Sĩ", searchText: "tên mới ca sĩ" })
      .where(eq(songs.id, s.id))
      .run();
    const r = await replaceSongFile(db, s.id, replaceInput(tone2, "zzz.wav"));
    expect(r.title).toBe("Tên Mới");
    expect(r.artist).toBe("Ca Sĩ");
    const row = db.select().from(songs).where(eq(songs.id, s.id)).get()!;
    expect(row.searchText).toBe("tên mới ca sĩ");
    expect(r.durationSec).toBeLessThan(s.durationSec);
  });

  it("replaceSongFile removes the old file when the extension changes", async () => {
    const s = await upload(tone, "a.wav");
    const fakeOld = `${s.id}.aac`; // pretend the stored file was an .aac
    fs.renameSync(musicPath(s.fileName), musicPath(fakeOld));
    db.update(songs).set({ fileName: fakeOld }).run();
    const r = await replaceSongFile(db, s.id, replaceInput(tone2, "b.wav"));
    expect(r.fileName).toBe(`${s.id}.wav`);
    expect(fs.existsSync(musicPath(fakeOld))).toBe(false);
    expect(fs.existsSync(musicPath(r.fileName))).toBe(true);
    await deleteSongFile(r.fileName);
    expect(fs.existsSync(musicPath(r.fileName))).toBe(false);
    await deleteSongFile(r.fileName); // idempotent
  });
});

describe("sha256Hex", () => {
  it("hashes abc", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toMatch(/^ba7816bf/);
  });
});
