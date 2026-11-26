import { describe, expect, it } from "vitest";
import { GUARD_MS, createActionGuard } from "@/app/live/components/action-guard";

describe("createActionGuard", () => {
  it("lets the same action through once per 300 ms; different actions pass", () => {
    let now = 1000;
    const pass = createActionGuard(() => now);
    expect(GUARD_MS).toBe(300);
    expect(pass("next")).toBe(true);
    now += 100;
    expect(pass("next")).toBe(false); // double click
    expect(pass("bg")).toBe(true); // a different action is not blocked
    expect(pass("stop")).toBe(true);
    now += 199; // 299 ms after the first accepted "next"
    expect(pass("next")).toBe(false);
    now += 1; // 300 ms
    expect(pass("next")).toBe(true);
    expect(pass("cue:2")).toBe(true);
    expect(pass("cue:3")).toBe(true);
  });
});
