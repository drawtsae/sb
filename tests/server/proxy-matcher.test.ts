// @vitest-environment node
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

const re = new RegExp(`^${config.matcher[0]}$`);

describe("proxy matcher", () => {
  it("skips the streaming song routes (Next would buffer and truncate their bodies)", () => {
    expect(re.test("/api/songs/upload")).toBe(false);
    expect(re.test("/api/songs/abc/file")).toBe(false);
  });
  it("still covers everything else", () => {
    expect(re.test("/library")).toBe(true);
    expect(re.test("/api/songs/by-hash")).toBe(true);
    expect(re.test("/api/songs/abc")).toBe(true);
    expect(re.test("/api/songs/abc/other")).toBe(true);
    expect(re.test("/login")).toBe(false);
  });
  it("leaves the PWA files public (the SW precaches them, logged in or not)", () => {
    for (const p of ["/live", "/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.ico"]) {
      expect(re.test(p), p).toBe(false);
    }
    expect(re.test("/iconsx")).toBe(true);
  });
});
