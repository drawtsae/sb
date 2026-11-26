// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Cue } from "@/lib/types";
import { cueSchema, parseSettings } from "@/lib/validation";

const cue = (o: Partial<Cue> = {}): Cue => ({
  id: "c1", position: 0, kind: "song", name: "Entrance", songId: "s1",
  startSec: 0, endSec: null, fadeInSec: null, fadeOutSec: null,
  volume: 80, onEnd: "stop", note: "", transition: null, ...o,
});

describe("parseSettings", () => {
  it("returns defaults for {}", () => expect(parseSettings({})).toEqual(DEFAULT_SETTINGS));
  it("returns defaults for invalid JSON", () => expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS));
  it("returns defaults for non-objects", () => {
    expect(parseSettings("5")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1])).toEqual(DEFAULT_SETTINGS);
  });
  it("fills missing keys from defaults", () => {
    const s = parseSettings({ bgVolume: 0.5 });
    expect(s.bgVolume).toBe(0.5);
    expect(s.cueFadeSec).toBe(3);
  });
  it("accepts a JSON string", () => expect(parseSettings('{"shuffle":true}').shuffle).toBe(true));
  it("drops unknown keys", () => expect(parseSettings({ foo: 1 })).toEqual(DEFAULT_SETTINGS));
  it("falls back per key on invalid values", () => {
    const s = parseSettings({ bgVolume: 5, masterVolume: 0.2, cueFadeSec: 0.05, stopFadeSec: 31, shuffle: "yes" });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 0.2 });
  });
  it("accepts range boundaries", () => {
    const s = parseSettings({ bgVolume: 0, masterVolume: 1, cueFadeSec: 0.1, bgCrossfadeSec: 30 });
    expect(s).toMatchObject({ bgVolume: 0, masterVolume: 1, cueFadeSec: 0.1, bgCrossfadeSec: 30 });
  });
});

describe("transition", () => {
  it("defaults settings to crossfade", () => expect(parseSettings({}).defaultTransition).toBe("crossfade"));
  it("falls back on an invalid default transition", () =>
    expect(parseSettings({ defaultTransition: "instant" }).defaultTransition).toBe("crossfade"));
  it("accepts fade_out_in", () =>
    expect(parseSettings({ defaultTransition: "fade_out_in" }).defaultTransition).toBe("fade_out_in"));
  it("defaults a cue transition to null", () => {
    const { transition: _t, ...rest } = cue();
    void _t;
    const r = cueSchema.parse(rest);
    expect(r.transition).toBeNull();
  });
  it("rejects an unknown cue transition", () =>
    expect(cueSchema.safeParse({ ...cue(), transition: "instant" }).success).toBe(false));
});

describe("cueSchema", () => {
  it("accepts a valid song cue", () => expect(cueSchema.safeParse(cue()).success).toBe(true));
  it("rejects song cue with null songId", () => expect(cueSchema.safeParse(cue({ songId: null })).success).toBe(false));
  it("accepts background cue with null songId", () =>
    expect(cueSchema.safeParse(cue({ kind: "background", songId: null })).success).toBe(true));
  it("rejects endSec <= startSec", () => {
    expect(cueSchema.safeParse(cue({ startSec: 20, endSec: 10 })).success).toBe(false);
    expect(cueSchema.safeParse(cue({ startSec: 10, endSec: 10 })).success).toBe(false);
    expect(cueSchema.safeParse(cue({ startSec: 10, endSec: 11 })).success).toBe(true);
  });
  it("rejects negative startSec", () => expect(cueSchema.safeParse(cue({ startSec: -1 })).success).toBe(false));
  it("validates volume as integer 0-100", () => {
    for (const v of [-1, 101, 50.5]) expect(cueSchema.safeParse(cue({ volume: v })).success).toBe(false);
    for (const v of [0, 100]) expect(cueSchema.safeParse(cue({ volume: v })).success).toBe(true);
  });
  it("validates fades as null or 0.1-30", () => {
    for (const v of [0, 0.05, 30.1]) {
      expect(cueSchema.safeParse(cue({ fadeInSec: v })).success).toBe(false);
      expect(cueSchema.safeParse(cue({ fadeOutSec: v })).success).toBe(false);
    }
    for (const v of [null, 0.1, 30]) expect(cueSchema.safeParse(cue({ fadeInSec: v, fadeOutSec: v })).success).toBe(true);
  });
  it("rejects bad kind and onEnd", () => {
    expect(cueSchema.safeParse({ ...cue(), kind: "x" }).success).toBe(false);
    expect(cueSchema.safeParse({ ...cue(), onEnd: "x" }).success).toBe(false);
  });
  it("accepts onEnd resume_background", () =>
    expect(cueSchema.safeParse(cue({ onEnd: "resume_background" })).success).toBe(true));
});
