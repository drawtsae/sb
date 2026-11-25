// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildOrder, nextPosition } from "@/lib/playback/background-order";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("buildOrder", () => {
  it("returns identity when not shuffling", () => {
    expect(buildOrder(3, false, Math.random)).toEqual([0, 1, 2]);
  });

  it("shuffled order is a permutation", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const o = buildOrder(6, true, mulberry32(seed));
      expect([...o].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("never starts with avoidFirst over 200 seeded runs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const o = buildOrder(3, true, mulberry32(seed), 2);
      expect(o[0]).not.toBe(2);
      expect([...o].sort()).toEqual([0, 1, 2]);
    }
  });

  it("handles count 1 and 0", () => {
    expect(buildOrder(1, true, Math.random, 0)).toEqual([0]);
    expect(buildOrder(0, true, Math.random)).toEqual([]);
    expect(buildOrder(0, false, Math.random)).toEqual([]);
  });
});

describe("nextPosition", () => {
  it("wraps to 0 without shuffle", () => {
    expect(nextPosition([0, 1, 2], 2, false, Math.random)).toEqual({ order: [0, 1, 2], pos: 0 });
  });

  it("advances within the order", () => {
    expect(nextPosition([2, 0, 1], 0, true, Math.random)).toEqual({ order: [2, 0, 1], pos: 1 });
  });

  it("reshuffles on wrap, avoiding the last played index first", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = nextPosition([0, 1, 2], 2, true, mulberry32(seed));
      expect(r.pos).toBe(0);
      expect(r.order[0]).not.toBe(2);
      expect([...r.order].sort()).toEqual([0, 1, 2]);
    }
  });

  it("empty order returns empty", () => {
    expect(nextPosition([], 0, true, Math.random)).toEqual({ order: [], pos: 0 });
  });
});
