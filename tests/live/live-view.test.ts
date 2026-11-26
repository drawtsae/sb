import { describe, expect, it } from "vitest";
import { bgPausedAt, bgProgress, bgSong, clock, cueProgress, nextCueIndex } from "@/app/live/components/live-view";
import { EMPTY_INFO } from "@/app/live/components/useLiveEngine";
import { restoreState } from "@/lib/offline/live-persist";
import { SNAP, run } from "../playback/fixtures";

const info = (songId: string | null, t: number, duration: number, paused = false) => ({ songId, t, duration, paused });

describe("live-view", () => {
  it("clock shows whole m:ss", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(102.9)).toBe("1:42");
    expect(clock(-3)).toBe("0:00");
    expect(clock(NaN)).toBe("0:00");
  });

  it("cue remaining counts down to the fade-out start (effective end − fade out − t), from the cue deck", () => {
    // q2: c1 from 0 to endSec 60, fade out 5 s: the fade starts at 55.
    const { state } = run([{ type: "GO_CUE", index: 2 }]);
    const p = cueProgress(state, SNAP, { bg: EMPTY_INFO, cue: info("c1", 42, 190) })!;
    expect(p).toMatchObject({ t: 42, end: 60, remaining: 13 });
    expect(p.fraction).toBeCloseTo(0.7);
    // Deck not loaded yet (or still holding another song): shown at the cue start.
    expect(cueProgress(state, SNAP, { bg: EMPTY_INFO, cue: info("b1", 100, 200) })).toMatchObject({ t: 0, remaining: 55 });
    // Not in cue mode: none.
    expect(cueProgress(run([{ type: "START_BACKGROUND" }]).state, SNAP, { bg: EMPTY_INFO, cue: EMPTY_INFO })).toBeNull();
  });

  it("cue without endSec ends at the song's end; start offset counts", () => {
    const { state } = run([{ type: "GO_CUE", index: 1 }]); // c1 from 45, song 190 s, default fade out 3 s
    expect(cueProgress(state, SNAP, { bg: EMPTY_INFO, cue: info("c1", 100, 190) })).toMatchObject({ end: 190, remaining: 87 });
  });

  it("bg progress, paused position and titles", () => {
    let { state } = run([{ type: "START_BACKGROUND" }]);
    expect(bgProgress(state, SNAP, { bg: info("b1", 50, 200), cue: EMPTY_INFO })).toMatchObject({ t: 50, remaining: 150 });
    expect(bgPausedAt(state, SNAP, { bg: info("b1", 50, 200), cue: EMPTY_INFO })).toBeNull();
    expect(bgSong(state, SNAP)?.id).toBe("b1");
    expect(bgSong(state, SNAP, 1)?.id).toBe("b2");
    state = run([{ type: "START_BACKGROUND" }, { type: "GO_CUE", index: 1 }]).state;
    expect(bgPausedAt(state, SNAP, { bg: info("b1", 75, 200, true), cue: EMPTY_INFO })).toBe(75);
    const restored = restoreState(SNAP, {
      currentCueIndex: 1, playedCueIds: ["q1"], bgOrder: [0, 1], bgPos: 1, bgPositionSec: 33, savedAt: "x",
    });
    expect(bgPausedAt(restored, SNAP, { bg: EMPTY_INFO, cue: EMPTY_INFO })).toBe(33);
    expect(bgSong(restored, SNAP)?.id).toBe("b2");
    expect(bgSong(restored, SNAP, 1)?.id).toBe("b1"); // wraps (no shuffle)
    expect(bgSong(restored, { ...SNAP, settings: { ...SNAP.settings, shuffle: true } }, 1)).toBeNull();
  });

  it("next cue index", () => {
    expect(nextCueIndex(run([]).state, SNAP)).toBe(0);
    expect(nextCueIndex(run([{ type: "GO_CUE", index: 1 }]).state, SNAP)).toBe(2);
    expect(nextCueIndex(run([{ type: "GO_CUE", index: 2 }]).state, SNAP)).toBeNull();
  });
});
