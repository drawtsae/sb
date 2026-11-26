import { afterEach, describe, expect, it } from "vitest";
import {
  LIVE_KEY,
  captureLive,
  clearLive,
  readLive,
  restoreState,
  saveLive,
  type LivePersisted,
} from "@/lib/offline/live-persist";
import { initialState, reduce } from "@/lib/playback/machine";
import { SNAP, rng, run } from "../playback/fixtures";

const SAVED: LivePersisted = {
  currentCueIndex: 1,
  playedCueIds: ["q0", "q1"],
  bgOrder: [1, 0],
  bgPos: 1,
  bgPositionSec: 42.5,
  savedAt: "2026-11-26T10:00:00.000Z",
};

const info = (songId: string | null, t: number, duration: number) => ({ songId, t, duration, paused: false });

afterEach(() => localStorage.clear());

describe("saveLive / readLive", () => {
  it("round-trips under sb:live:<eventId>", () => {
    expect(LIVE_KEY("e1")).toBe("sb:live:e1");
    saveLive("e1", SAVED);
    expect(JSON.parse(localStorage.getItem("sb:live:e1")!)).toEqual(SAVED);
    expect(readLive("e1")).toEqual(SAVED);
    expect(readLive("other")).toBeNull();
  });

  it("returns null for missing, corrupt or malformed data, and clearLive removes it", () => {
    expect(readLive("e1")).toBeNull();
    localStorage.setItem(LIVE_KEY("e1"), "{not json");
    expect(readLive("e1")).toBeNull();
    localStorage.setItem(LIVE_KEY("e1"), JSON.stringify({ ...SAVED, bgOrder: "x" }));
    expect(readLive("e1")).toBeNull();
    localStorage.setItem(LIVE_KEY("e1"), JSON.stringify({ ...SAVED, bgPositionSec: -1 }));
    expect(readLive("e1")).toBeNull();
    saveLive("e1", SAVED);
    clearLive("e1");
    expect(readLive("e1")).toBeNull();
  });
});

describe("readLive with the snapshot's takenAt", () => {
  it("returns a state saved for the same snapshot", () => {
    saveLive("e1", { ...SAVED, snapshotTakenAt: "T1" });
    expect(readLive("e1", "T1")).toMatchObject({ currentCueIndex: 1 });
  });

  it("ignores and clears a state saved for another snapshot (rehearsal, then a re-load)", () => {
    saveLive("e1", { ...SAVED, snapshotTakenAt: "T1" });
    expect(readLive("e1", "T2")).toBeNull();
    expect(localStorage.getItem(LIVE_KEY("e1"))).toBeNull();
  });

  it("ignores and clears a state without snapshotTakenAt", () => {
    saveLive("e1", SAVED);
    expect(readLive("e1", "T1")).toBeNull();
    expect(localStorage.getItem(LIVE_KEY("e1"))).toBeNull();
  });
});

describe("restoreState", () => {
  it("marks played cues, mode silent, bg not started, resumeAtSec = bgPositionSec", () => {
    const s = restoreState(SNAP, SAVED);
    expect(s.mode).toBe("silent");
    expect(s.currentCueIndex).toBe(1);
    expect(s.playedCueIds).toEqual(["q0", "q1"]);
    expect(s.bg).toEqual({
      order: [1, 0], pos: 1, activeDeck: "bg0", started: false, crossfading: false, fadingDeck: null, resumeAtSec: 42.5,
    });
    expect(s.cue).toEqual({ activeDeck: "cue0", cueIndex: null, ending: false, waiting: false });
    expect(s.master).toBe(SNAP.settings.masterVolume);
  });

  it("Phát nhạc nền after restore resumes the saved track at the saved position", () => {
    const out = reduce(restoreState(SNAP, SAVED), { type: "START_BACKGROUND" }, SNAP, rng);
    expect(out.state.mode).toBe("background");
    expect(out.commands[0]).toEqual({ type: "load", deck: "bg0", songId: "b1", atSec: 42.5 });
  });

  it("NEXT_CUE after restore goes to the cue after the saved one", () => {
    const out = reduce(restoreState(SNAP, SAVED), { type: "NEXT_CUE" }, SNAP, rng);
    expect(out.state.currentCueIndex).toBe(2);
    expect(out.state.mode).toBe("cue");
  });

  it("keeps a saved master volume", () => {
    expect(restoreState(SNAP, { ...SAVED, master: 0.6 }).master).toBe(0.6);
  });

  it("drops data that no longer fits the snapshot", () => {
    const s = restoreState(SNAP, {
      ...SAVED, currentCueIndex: 9, playedCueIds: ["q0", "gone"], bgOrder: [0, 1, 2], bgPos: 2,
    });
    expect(s.currentCueIndex).toBeNull();
    expect(s.playedCueIds).toEqual(["q0"]);
    expect(s.bg.order).toEqual(initialState(SNAP, rng).bg.order);
    expect(s.bg.pos).toBe(0);
    expect(s.bg.resumeAtSec).toBeNull();
    expect(s.mode).toBe("silent");
  });
});

describe("captureLive", () => {
  const now = new Date("2026-11-26T11:00:00.000Z");

  it("records cues, order and the bg deck position", () => {
    const { state } = run([{ type: "START_BACKGROUND" }, { type: "GO_CUE", index: 1 }]);
    const p = captureLive(state, SNAP, info("b1", 73.2, 200), null, now);
    expect(p).toEqual({
      currentCueIndex: 1, playedCueIds: ["q1"], bgOrder: [0, 1], bgPos: 0, bgPositionSec: 73.2,
      master: SNAP.settings.masterVolume, snapshotTakenAt: SNAP.takenAt, savedAt: now.toISOString(),
    });
  });

  it("bg not started: uses resumeAtSec (or 0), not the deck", () => {
    const restored = restoreState(SNAP, SAVED);
    expect(captureLive(restored, SNAP, info("b2", 190, 200), null, now).bgPositionSec).toBe(42.5);
    expect(captureLive(initialState(SNAP, rng), SNAP, info(null, 0, 0), null, now).bgPositionSec).toBe(0);
  });

  it("deck still loading (t 0, no duration) keeps the last good value for the same track", () => {
    const { state } = run([{ type: "START_BACKGROUND" }], restoreState(SNAP, { ...SAVED, bgOrder: [0, 1], bgPos: 0 }));
    const prev = { ...SAVED, bgOrder: [0, 1], bgPos: 0, bgPositionSec: 42.5 };
    expect(captureLive(state, SNAP, info("b1", 0, 0), prev, now).bgPositionSec).toBe(42.5);
    expect(captureLive(state, SNAP, info(null, 0, 0), prev, now).bgPositionSec).toBe(42.5);
    // A deck still holding another song (micro-fade before the swap) is not trusted either.
    expect(captureLive(state, SNAP, info("b2", 150, 180), prev, now).bgPositionSec).toBe(42.5);
  });

  it("deck still loading a new track (pos changed): position 0, never the old track's value", () => {
    let { state } = run([{ type: "START_BACKGROUND" }]);
    const prev = captureLive(state, SNAP, info("b1", 190, 200), null, now);
    state = reduce(state, { type: "BG_TIME", deck: "bg0", t: 197, duration: 200 }, SNAP, rng).state;
    expect(state.bg.pos).toBe(1);
    expect(captureLive(state, SNAP, info("b2", 0, 0), prev, now).bgPositionSec).toBe(0);
  });
});
