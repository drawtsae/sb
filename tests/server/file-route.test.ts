// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { writeToneWav } from "../../scripts/make-fixtures";
import { getDb, resetDbForTests } from "@/server/db/client";
import { createSession } from "@/server/auth/session";
import { createUser } from "@/server/repo/users";
import { folders } from "@/server/db/schema";
import { GET as getFile, PUT as putFile } from "@/app/api/songs/[id]/file/route";
import { PUT as upload } from "@/app/api/songs/upload/route";
import { GET as byHash } from "@/app/api/songs/by-hash/route";

let root: string;
let bytes: Buffer;
let bytes2: Buffer;
let cookie: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-route-"));
  const a = path.join(root, "t.wav");
  const b = path.join(root, "t2.wav");
  writeToneWav(a, 440, 1);
  writeToneWav(b, 550, 1);
  bytes = fs.readFileSync(a);
  bytes2 = fs.readFileSync(b);
});
afterAll(() => {
  resetDbForTests();
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(async () => {
  resetDbForTests();
  process.env.DATA_DIR = fs.mkdtempSync(path.join(root, "d-"));
  delete process.env.MAX_UPLOAD_MB;
  const db = getDb();
  const u = await createUser(db, "u@x.com", "pw123456", false);
  cookie = `sb_session=${(await createSession(db, u.id)).token}`;
});

const put = (qs: string, body: Buffer = bytes, headers: Record<string, string> = { cookie }) =>
  upload(
    new Request(`http://t/api/songs/upload?${qs}`, {
      method: "PUT",
      body: new Uint8Array(body),
      headers,
    }),
  );
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seed(): Promise<{ id: string; hash: string }> {
  const r = await put("name=a.wav&folderId=");
  expect(r.status).toBe(201);
  const s = await r.json();
  return { id: s.id, hash: s.contentHash };
}

describe("upload route", () => {
  it("401 without session, 201 with", async () => {
    expect((await put("name=a.wav", bytes, {})).status).toBe(401);
    const r = await put("name=a.wav");
    expect(r.status).toBe(201);
    expect((await r.json()).title).toBe("a");
  });
  it("400 unsupported_type, unreadable, unknown_folder", async () => {
    const u = await put("name=a.flac");
    expect(u.status).toBe(400);
    expect(await u.json()).toEqual({ reason: "unsupported_type" });
    const bad = await put("name=a.mp3", Buffer.alloc(500, 1));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ reason: "unreadable" });
    const uf = await put("name=a.wav&folderId=nope");
    expect(uf.status).toBe(400);
    expect(await uf.json()).toEqual({ reason: "unknown_folder" });
  });
  it("accepts an existing folder", async () => {
    const f = getDb().insert(folders).values({ name: "F" }).returning().get();
    const r = await put(`name=a.wav&folderId=${f.id}`);
    expect((await r.json()).folderId).toBe(f.id);
  });
  it("413 when over the size limit", async () => {
    process.env.MAX_UPLOAD_MB = "0.0001"; // about 104 bytes
    const r = await put("name=a.wav");
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ reason: "too_large" });
  });
});

describe("by-hash route", () => {
  it("validates and looks up", async () => {
    const { hash } = await seed();
    const g = (h: string, withCookie = true) =>
      byHash(
        new Request(`http://t/api/songs/by-hash?h=${h}`, {
          headers: withCookie ? { cookie } : {},
        }),
      );
    expect((await g(hash, false)).status).toBe(401);
    expect((await g("xyz")).status).toBe(400);
    expect((await g(hash.toUpperCase())).status).toBe(400);
    expect((await (await g(hash)).json()).song.contentHash).toBe(hash);
    expect(await (await g("0".repeat(64))).json()).toEqual({ song: null });
  });
});

describe("file route", () => {
  const get = (id: string, headers: Record<string, string> = {}) =>
    getFile(new Request("http://t/x", { headers: { cookie, ...headers } }), ctx(id));

  it("401 without session", async () => {
    const { id } = await seed();
    expect((await getFile(new Request("http://t/x"), ctx(id))).status).toBe(401);
  });
  it("404 for unknown id", async () => {
    expect((await get("nope")).status).toBe(404);
  });
  it("200 full file with headers", async () => {
    const { id } = await seed();
    const r = await get(id);
    expect(r.status).toBe(200);
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(r.headers.get("content-length")).toBe(String(bytes.length));
    expect(Buffer.from(await r.arrayBuffer()).equals(bytes)).toBe(true);
  });
  it("returns 206 with correct Content-Range for bytes=0-99", async () => {
    const { id } = await seed();
    const r = await get(id, { range: "bytes=0-99" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 0-99/${bytes.length}`);
    expect(r.headers.get("content-length")).toBe("100");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await r.arrayBuffer()).equals(bytes.subarray(0, 100))).toBe(true);
  });
  it("supports open-ended and suffix ranges; 416 when unsatisfiable", async () => {
    const { id } = await seed();
    const len = bytes.length;
    const a = await get(id, { range: "bytes=1000-" });
    expect(a.status).toBe(206);
    expect(a.headers.get("content-range")).toBe(`bytes 1000-${len - 1}/${len}`);
    expect(Buffer.from(await a.arrayBuffer()).equals(bytes.subarray(1000))).toBe(true);
    const b = await get(id, { range: "bytes=-50" });
    expect(b.status).toBe(206);
    expect(b.headers.get("content-range")).toBe(`bytes ${len - 50}-${len - 1}/${len}`);
    expect(Buffer.from(await b.arrayBuffer()).equals(bytes.subarray(len - 50))).toBe(true);
    const c = await get(id, { range: `bytes=${len}-` });
    expect(c.status).toBe(416);
    expect(c.headers.get("content-range")).toBe(`bytes */${len}`);
    expect((await get(id, { range: "bytes=5-2" })).status).toBe(416);
    expect((await get(id, { range: "bytes=-0" })).status).toBe(416);
    const e = await get(id, { range: `bytes=10-${len + 500}` });
    expect(e.headers.get("content-range")).toBe(`bytes 10-${len - 1}/${len}`);
  });
  it("PUT replaces the file; 401 and 404 handled", async () => {
    const { id, hash } = await seed();
    const mk = (i: string, withCookie: boolean) =>
      putFile(
        new Request("http://t/x?name=n.wav", {
          method: "PUT",
          body: new Uint8Array(bytes2),
          headers: withCookie ? { cookie } : {},
        }),
        ctx(i),
      );
    expect((await mk(id, false)).status).toBe(401);
    expect((await mk("nope", true)).status).toBe(404);
    const r = await mk(id, true);
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.id).toBe(id);
    expect(s.contentHash).not.toBe(hash);
  });
});
