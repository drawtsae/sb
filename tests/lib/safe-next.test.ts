import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("allows relative paths", () => {
    expect(safeNext("/library")).toBe("/library");
    expect(safeNext("/events/1?x=2")).toBe("/events/1?x=2");
  });
  it("rejects external or malformed targets", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "/a\nb", "", undefined, 5]) {
      expect(safeNext(bad)).toBe("/events");
    }
  });
});
