import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { writeToneWav } from "../scripts/make-fixtures";

test("uploads a >10 MB file without truncation", async ({ request }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-big-"));
  try {
    const file = path.join(dir, "big.wav");
    writeToneWav(file, 440, 300); // ~13 MB
    const bytes = fs.readFileSync(file);
    expect(bytes.length).toBeGreaterThan(12 * 1024 * 1024);
    const res = await request.put("/api/songs/upload?name=big.wav&folderId=", {
      data: bytes,
      headers: { "content-type": "application/octet-stream" },
      timeout: 120_000,
    });
    expect(res.status()).toBe(201);
    const song = await res.json();
    expect(song.fileSize).toBe(bytes.length);
    expect(song.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
