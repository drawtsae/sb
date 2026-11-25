// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  effectiveEnd,
  fadeIn,
  fadeOut,
  initialState,
  reduce,
  type Command,
  type PlaybackEvent,
} from "@/lib/playback/machine";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { deepFreeze, load, play, ramp, rng, run, SNAP } from "./fixtures";

const START: PlaybackEvent = { type: "START_BACKGROUND" };
const BACK: PlaybackEvent = { type: "BACK_TO_BACKGROUND" };
const NEXT: PlaybackEvent = { type: "NEXT_CUE" };
const STOP: PlaybackEvent = { type: "FADE_STOP" };
const go = (index: number): PlaybackEvent => ({ type: "GO_CUE", index });
const cueTime = (deck: "cue0" | "cue1", t: number): PlaybackEvent => ({ type: "CUE_TIME", deck, t });
const cueEnded = (deck: "cue0" | "cue1"): PlaybackEvent => ({ type: "CUE_ENDED", deck });
const bgTime = (deck: "bg0" | "bg1", t: number, duration: number): PlaybackEvent =>
  ({ type: "BG_TIME", deck, t, duration });
const bgEnded = (deck: "bg0" | "bg1"): PlaybackEvent => ({ type: "BG_ENDED", deck });

const isBg = (c: Command) => "deck" in c && c.deck.startsWith("bg");
const ramps = (cmds: Command[]) => cmds.filter((c) => c.type === "ramp");

describe("helpers", () => {
  it("effectiveEnd / fadeIn / fadeOut fall back to song duration and cueFadeSec", () => {
    const [, c1, c2] = SNAP.cues;
    expect(effectiveEnd(c1, SNAP.songs.c1)).toBe(190);
    expect(effectiveEnd(c2, SNAP.songs.c1)).toBe(60);
    expect(fadeIn(c1, DEFAULT_SETTINGS)).toBe(3);
    expect(fadeOut(c1, DEFAULT_SETTINGS)).toBe(3);
    expect(fadeOut(c2, DEFAULT_SETTINGS)).toBe(5);
  });

  it("initialState", () => {
    const s = initialState(SNAP, rng);
    expect(s).toEqual({
      mode: "idle", currentCueIndex: null, playedCueIds: [],
      bg: { order: [0, 1], pos: 0, activeDeck: "bg0", started: false, crossfading: false,
            fadingDeck: null, resumeAtSec: null },
      cue: { activeDeck: "cue0", cueIndex: null, ending: false },
      master: 0.9,
    });
  });
});

describe("reduce (brief table)", () => {
  it("START_BACKGROUND from idle loads and fades in b1", () => {
    const { state, commands } = run([START]);
    expect(commands).toEqual([load("bg0", "b1", 0), play("bg0"), ramp("bg0", 0.7, 3)]);
    expect(state.mode).toBe("background");
  });

  it("GO_CUE song fades bg out and cue in", () => {
    const { state, commands } = run([START, go(1)]);
    expect(commands).toContainEqual(ramp("bg0", 0, 3, true));
    expect(commands).toContainEqual(load("cue0", "c1", 45));
    expect(commands).toContainEqual(play("cue0"));
    expect(commands).toContainEqual(ramp("cue0", 1, 3));
    expect(state.mode).toBe("cue");
    expect(state.currentCueIndex).toBe(1);
    expect(state.playedCueIds).toContain("q1");
  });

  it("GO_CUE from cue to cue uses the other cue deck", () => {
    const { state, commands } = run([go(1), go(2)]);
    expect(commands).toContainEqual(ramp("cue0", 0, 3, true));
    expect(commands).toContainEqual(load("cue1", "c1", 0));
    expect(state.cue.activeDeck).toBe("cue1");
  });

  it("cue reaching end minus fadeOut resumes background without reload", () => {
    const { state, commands } = run([START, go(1), cueTime("cue0", 187)]);
    expect(commands).toEqual([ramp("cue0", 0, 3, true), play("bg0"), ramp("bg0", 0.7, 3)]);
    expect(commands.some((c) => c.type === "load")).toBe(false);
    expect(state.mode).toBe("background");
  });

  it("second CUE_TIME after ending emits nothing", () => {
    const { commands } = run([START, go(1), cueTime("cue0", 187), cueTime("cue0", 188)]);
    expect(commands).toEqual([]);
  });

  it("onEnd stop goes silent", () => {
    const { state, commands } = run([go(2), cueTime("cue0", 55)]);
    expect(commands).toEqual([ramp("cue0", 0, 5, true)]);
    expect(state.mode).toBe("silent");
  });

  it("CUE_ENDED before fade point still transitions", () => {
    const { state, commands } = run([START, go(1), cueEnded("cue0")]);
    expect(commands).toContainEqual(play("bg0"));
    expect(commands).toContainEqual(ramp("bg0", 0.7, 3));
    expect(state.mode).toBe("background");
  });

  it("background-kind cue acts as back-to-background and marks current", () => {
    const { state, commands } = run([START, go(1), go(0)]);
    expect(commands).toContainEqual(play("bg0"));
    expect(commands).toContainEqual(ramp("bg0", 0.7, 3));
    expect(state.currentCueIndex).toBe(0);
    expect(state.mode).toBe("background");
  });

  it("NEXT_CUE from null goes to 0; past end is no-op", () => {
    expect(run([NEXT]).state.currentCueIndex).toBe(0);
    const before = run([go(2)]).state;
    const out = reduce(before, NEXT, SNAP, rng);
    expect(out.commands).toEqual([]);
    expect(out.state).toEqual(before);
  });

  it("FADE_STOP ramps audible decks to 0 over stopFadeSec", () => {
    const { state, commands } = run([go(1), STOP]);
    expect(commands).toEqual([ramp("cue0", 0, 3, true)]);
    expect(state.mode).toBe("silent");
  });

  it("background crossfade at duration minus 4s", () => {
    const { state, commands } = run([START, bgTime("bg0", 196, 200)]);
    expect(commands).toEqual([
      load("bg1", "b2", 0), play("bg1"), ramp("bg1", 0.7, 4), ramp("bg0", 0, 4, true),
    ]);
    expect(state.bg.activeDeck).toBe("bg1");
  });

  it("background wraps to first track", () => {
    const { commands } = run([START, bgTime("bg0", 196, 200), bgTime("bg1", 176, 180)]);
    expect(commands).toContainEqual(load("bg0", "b1", 0));
  });

  it("BG_ENDED before crossfade point still advances", () => {
    const { commands } = run([START, bgEnded("bg0")]);
    expect(commands).toContainEqual(load("bg1", "b2", 0));
    expect(commands).toContainEqual(play("bg1"));
    expect(commands).toContainEqual(ramp("bg1", 0.7, 4));
  });

  it("GO_CUE during background crossfade fades both bg decks; resume plays only incoming", () => {
    const r1 = run([START, bgTime("bg0", 196, 200), go(1)]);
    expect(r1.commands).toContainEqual(ramp("bg0", 0, 3, true));
    expect(r1.commands).toContainEqual(ramp("bg1", 0, 3, true));
    expect(r1.state.bg.crossfading).toBe(false);
    expect(r1.state.bg.fadingDeck).toBeNull();
    const r2 = run([BACK], r1.state);
    const bgPlays = r2.commands.filter((c) => c.type === "play" && isBg(c));
    expect(bgPlays).toEqual([play("bg1")]);
  });

  it("restored resumeAtSec is used once", () => {
    const init = initialState(SNAP, rng);
    const restored = { ...init, bg: { ...init.bg, resumeAtSec: 83 } };
    const { state, commands } = run([START], restored);
    expect(commands).toContainEqual(load("bg0", "b1", 83));
    expect(state.bg.resumeAtSec).toBeNull();
  });

  it("rapid GO_CUE presses never emit a sub-0.1s ramp", () => {
    const { log, state } = run([go(1), go(2), go(1)]);
    for (const r of ramps(log.flat())) expect(r.type === "ramp" && r.seconds).toBeGreaterThanOrEqual(0.1);
    const loads = log.flat().filter((c) => c.type === "load");
    expect(loads.map((c) => c.type === "load" && c.deck)).toEqual(["cue0", "cue1", "cue0"]);
    expect(state.cue.activeDeck).toBe("cue0");
  });

  it("empty background: resume goes silent", () => {
    const snap = { ...SNAP, background: [] };
    const { state, commands } = run([go(1), cueTime("cue0", 187)], undefined, snap);
    expect(state.mode).toBe("silent");
    expect(commands.filter(isBg)).toEqual([]);
  });

  it("stale CUE_TIME from inactive deck ignored", () => {
    const { commands } = run([go(1), go(2), cueTime("cue0", 187)]);
    expect(commands).toEqual([]);
  });

  it("SET_MASTER clamps", () => {
    const out = run([{ type: "SET_MASTER", to: 1.4 }]);
    expect(out.state.master).toBe(1);
    expect(out.commands).toEqual([{ type: "master", to: 1 }]);
    expect(run([{ type: "SET_MASTER", to: -2 }]).state.master).toBe(0);
  });
});

describe("reduce (controller rulings and edge cases)", () => {
  it("is pure: frozen inputs are not mutated", () => {
    const snap = deepFreeze(structuredClone(SNAP));
    const events: PlaybackEvent[] = [
      START, bgTime("bg0", 196, 200), go(1), go(2), cueTime("cue1", 55), BACK, go(0), NEXT,
      bgTime("bg1", 10, 180), STOP, { type: "SET_MASTER", to: 0.5 }, bgEnded("bg1"),
    ];
    let state = deepFreeze(initialState(snap, rng));
    for (const ev of events) {
      const before = structuredClone(state);
      const out = reduce(state, ev, snap, rng);
      expect(state).toEqual(before);
      state = deepFreeze(out.state);
    }
  });

  it("returned state is a new object when something changes", () => {
    const s0 = initialState(SNAP, rng);
    const { state } = reduce(s0, START, SNAP, rng);
    expect(state).not.toBe(s0);
    expect(state.bg).not.toBe(s0.bg);
  });

  it("GO_CUE with an out-of-range index is a no-op", () => {
    const s0 = initialState(SNAP, rng);
    for (const i of [-1, 3, 99]) {
      const out = reduce(s0, go(i), SNAP, rng);
      expect(out.commands).toEqual([]);
      expect(out.state).toEqual(s0);
    }
  });

  it("GO_CUE on a song cue whose song is missing is a no-op", () => {
    const snap = { ...SNAP, songs: { b1: SNAP.songs.b1, b2: SNAP.songs.b2 } };
    const s0 = initialState(snap, rng);
    const out = reduce(s0, go(1), snap, rng);
    expect(out.commands).toEqual([]);
    expect(out.state).toEqual(s0);
  });

  it("GO_CUE on the playing cue restarts it on the other deck", () => {
    const { state, commands } = run([go(1), go(1)]);
    expect(commands).toEqual([ramp("cue0", 0, 3, true), load("cue1", "c1", 45), play("cue1"), ramp("cue1", 1, 3)]);
    expect(state.cue.activeDeck).toBe("cue1");
    expect(state.playedCueIds).toEqual(["q1"]);
  });

  it("GO_CUE from idle emits no bg ramp", () => {
    const { commands } = run([go(1)]);
    expect(commands).toEqual([load("cue0", "c1", 45), play("cue0"), ramp("cue0", 1, 3)]);
  });

  it("GO_CUE after a cue faded out uses the other deck so the fade is not cut", () => {
    const { commands, state } = run([START, go(1), cueTime("cue0", 187), go(2)]);
    expect(commands).toContainEqual(load("cue1", "c1", 0));
    expect(commands).toContainEqual(ramp("bg0", 0, 3, true));
    expect(commands.some((c) => c.type === "ramp" && c.deck === "cue0")).toBe(false);
    expect(state.cue.ending).toBe(false);
  });

  it("currentCueIndex stays after natural end; NEXT_CUE advances from it", () => {
    const r = run([START, go(1), cueTime("cue0", 187)]);
    expect(r.state.currentCueIndex).toBe(1);
    const n = run([NEXT], r.state);
    expect(n.state.currentCueIndex).toBe(2);
    expect(n.commands).toContainEqual(load("cue1", "c1", 0));
  });

  it("background-kind cue from idle starts background over cueFadeSec and is marked played", () => {
    const { state, commands } = run([go(0)]);
    expect(commands).toEqual([load("bg0", "b1", 0), play("bg0"), ramp("bg0", 0.7, 3)]);
    expect(state.playedCueIds).toEqual(["q0"]);
  });

  it("background-kind cue while a cue with fadeOut 5 plays uses the outgoing fadeOut", () => {
    const { commands } = run([START, go(2), go(0)]);
    expect(commands).toEqual([ramp("cue0", 0, 5, true), play("bg0"), ramp("bg0", 0.7, 5)]);
  });

  it("background-kind cue in background mode only marks current", () => {
    const r = run([START, go(0)]);
    expect(r.commands).toEqual([]);
    expect(r.state.currentCueIndex).toBe(0);
    expect(r.state.playedCueIds).toEqual(["q0"]);
  });

  it("BACK_TO_BACKGROUND / START_BACKGROUND in background mode is a no-op", () => {
    const s = run([START]).state;
    for (const ev of [BACK, START]) {
      const out = reduce(s, ev, SNAP, rng);
      expect(out.commands).toEqual([]);
      expect(out.state).toEqual(s);
    }
  });

  it("BACK_TO_BACKGROUND from silent fades in over cueFadeSec", () => {
    const { commands, state } = run([START, go(2), cueTime("cue0", 55), BACK]);
    expect(commands).toEqual([play("bg0"), ramp("bg0", 0.7, 3)]);
    expect(state.mode).toBe("background");
  });

  it("FADE_STOP from background during crossfade ramps both bg decks and keeps position", () => {
    const { state, commands } = run([START, bgTime("bg0", 196, 200), STOP]);
    expect(commands).toEqual([ramp("bg1", 0, 3, true), ramp("bg0", 0, 3, true)]);
    expect(state.mode).toBe("silent");
    expect(state.bg.started).toBe(true);
    expect(state.bg.crossfading).toBe(false);
    expect(state.bg.fadingDeck).toBeNull();
    expect(run([START], state).commands).toEqual([play("bg1"), ramp("bg1", 0.7, 3)]);
  });

  it("FADE_STOP from idle or silent emits nothing", () => {
    expect(run([STOP]).commands).toEqual([]);
    expect(run([go(1), STOP, STOP]).commands).toEqual([]);
  });

  it("cue events after FADE_STOP do not resume the background", () => {
    const { state, commands } = run([START, go(1), STOP, cueTime("cue0", 188)]);
    expect(commands).toEqual([]);
    expect(state.mode).toBe("silent");
    expect(run([START, go(1), STOP, cueEnded("cue0")]).commands).toEqual([]);
  });

  it("BG_TIME is ignored outside background mode or from the inactive deck", () => {
    expect(run([START, go(1), bgTime("bg0", 197, 200)]).commands).toEqual([]);
    expect(run([START, bgTime("bg1", 197, 200)]).commands).toEqual([]);
  });

  it("crossfade flags clear on first BG_TIME of the new deck past bgCrossfadeSec", () => {
    const r1 = run([START, bgTime("bg0", 196, 200), bgTime("bg1", 2, 180)]);
    expect(r1.state.bg.crossfading).toBe(true);
    expect(r1.commands).toEqual([]);
    const r2 = run([bgTime("bg1", 4, 180)], r1.state);
    expect(r2.state.bg.crossfading).toBe(false);
    expect(r2.state.bg.fadingDeck).toBeNull();
    expect(r2.commands).toEqual([]);
  });

  it("BG_TIME with unknown duration does not trigger a crossfade", () => {
    expect(run([START, bgTime("bg0", 1, Number.NaN)]).commands).toEqual([]);
    expect(run([START, bgTime("bg0", 0, 0)]).commands).toEqual([]);
  });

  it("bg track ending while paused for a cue makes resume load the next track", () => {
    const r = run([START, bgTime("bg0", 190, 200), go(1), bgEnded("bg0")]);
    expect(r.commands).toEqual([]);
    expect(r.state.bg.started).toBe(false);
    const back = run([BACK], r.state);
    expect(back.commands).toContainEqual(load("bg0", "b2", 0));
  });

  it("SET_MASTER ignores non-finite values", () => {
    const s = initialState(SNAP, rng);
    const out = reduce(s, { type: "SET_MASTER", to: Number.NaN }, SNAP, rng);
    expect(out.commands).toEqual([]);
    expect(out.state.master).toBe(0.9);
  });

  it("every ramp is at least 0.1s even with zero fades configured", () => {
    const snap = {
      ...SNAP,
      settings: { ...SNAP.settings, cueFadeSec: 0, bgCrossfadeSec: 0, stopFadeSec: 0 },
      cues: SNAP.cues.map((c) => ({ ...c, fadeInSec: 0, fadeOutSec: 0 })),
    };
    const { log } = run(
      [START, bgTime("bg0", 200, 200), go(1), go(2), cueTime("cue1", 60), BACK, STOP],
      undefined, snap,
    );
    const rs = ramps(log.flat());
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(r.type === "ramp" && r.seconds).toBeGreaterThanOrEqual(0.1);
  });
});
