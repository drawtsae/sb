// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioDriver } from "@/lib/playback/audio-driver";
import type { Command, Deck, PlaybackEvent } from "@/lib/playback/machine";
import { DECKS, FakeContext, FakeElement } from "./fakes";

const url = (songId: string) => `blob:test/${songId}`;

function setup() {
  const ctx = new FakeContext();
  const els = {} as Record<Deck, FakeElement>;
  const created: Deck[] = [];
  const driver = createAudioDriver(ctx as unknown as AudioContext, url, {
    createElement: (deck) => {
      created.push(deck);
      els[deck] = new FakeElement();
      return els[deck] as unknown as HTMLAudioElement;
    },
  });
  const events: PlaybackEvent[] = [];
  const off = driver.onEvent((ev) => events.push(ev));
  const gain = (deck: Deck) => ctx.deckGain(els[deck]).gain;
  return { ctx, els, created, driver, events, off, gain };
}

const load = (deck: Deck, songId: string, atSec = 0): Command => ({ type: "load", deck, songId, atSec });
const play = (deck: Deck): Command => ({ type: "play", deck });
const ramp = (deck: Deck, to: number, seconds: number, pauseAtEnd?: boolean): Command =>
  pauseAtEnd ? { type: "ramp", deck, to, seconds, pauseAtEnd } : { type: "ramp", deck, to, seconds };

/** Load + play a deck, deliver metadata, and leave it audible at `level`. */
function playing(s: ReturnType<typeof setup>, deck: Deck, songId: string, level: number, duration = 200) {
  s.driver.run([load(deck, songId), play(deck), ramp(deck, level, 1)]);
  s.els[deck].metadata(duration);
  s.gain(deck).value = level; // the fade-in has completed
  s.gain(deck).calls = [];
  s.els[deck].play.mockClear();
  s.els[deck].pause.mockClear();
  s.els[deck].log = [];
  s.els[deck].seeks = [];
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("setup", () => {
  it("chains element → source → deck gain (starts at 0) → master → destination", () => {
    const s = setup();
    expect(s.created).toEqual(DECKS);
    const master = s.ctx.masterGain();
    for (const deck of DECKS) {
      const el = s.els[deck];
      expect(el.preload).toBe("auto");
      expect(el.dataset.deck).toBe(deck);
      const source = s.ctx.sources.find((x) => x.mediaElement === el)!;
      const g = s.ctx.deckGain(el);
      expect(source.connectedTo).toEqual([g]);
      expect(g.gain.value).toBe(0);
      expect(g.connectedTo).toEqual([master]);
    }
    expect(master.connectedTo).toEqual([s.ctx.destination]);
  });
});

describe("ramp", () => {
  it("ramp starts from current value", () => {
    const s = setup();
    playing(s, "cue0", "c1", 0.4);
    s.ctx.currentTime = 10;
    s.driver.run([ramp("cue0", 1, 3)]);
    expect(s.gain("cue0").calls).toEqual([
      ["cancelScheduledValues", 10],
      ["setValueAtTime", 0.4, 10],
      ["linearRampToValueAtTime", 1, 13],
    ]);
  });

  it("pauseAtEnd pauses after ramp and is cancelled by a newer ramp", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7);
    s.driver.run([ramp("bg0", 0, 2, true)]);
    vi.advanceTimersByTime(2049);
    expect(s.els.bg0.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.els.bg0.pause).toHaveBeenCalledTimes(1);

    const t = setup();
    playing(t, "bg0", "b1", 0.7);
    t.driver.run([ramp("bg0", 0, 2, true)]);
    vi.advanceTimersByTime(1000);
    t.driver.run([ramp("bg0", 0.7, 2)]);
    vi.advanceTimersByTime(10_000);
    expect(t.els.bg0.pause).not.toHaveBeenCalled();
  });

  it("a newer pauseAtEnd ramp replaces the older timer", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7);
    s.driver.run([ramp("bg0", 0, 2, true)]);
    vi.advanceTimersByTime(1000);
    s.driver.run([ramp("bg0", 0, 3, true)]);
    vi.advanceTimersByTime(3049);
    expect(s.els.bg0.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.els.bg0.pause).toHaveBeenCalledTimes(1);
  });
});

describe("ruling 1: play/ramp cancel a pending pause", () => {
  it("BACK during the bg fade-out: play + ramp up, the old pause never fires", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7);
    s.driver.run([ramp("bg0", 0, 3, true)]);
    vi.advanceTimersByTime(1000);
    s.driver.run([play("bg0"), ramp("bg0", 0.7, 3)]);
    vi.advanceTimersByTime(10_000);
    expect(s.els.bg0.pause).not.toHaveBeenCalled();
    expect(s.els.bg0.play).toHaveBeenCalledTimes(1);
  });

  it("a play alone also clears the pending pause", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7);
    s.driver.run([ramp("bg0", 0, 3, true)]);
    vi.advanceTimersByTime(1000);
    s.driver.run([play("bg0")]);
    vi.advanceTimersByTime(10_000);
    expect(s.els.bg0.pause).not.toHaveBeenCalled();
  });
});

describe("load", () => {
  it("play before metadata waits", () => {
    const s = setup();
    s.driver.run([load("cue0", "c1", 45), play("cue0")]);
    expect(s.els.cue0.src).toBe(url("c1"));
    expect(s.els.cue0.play).not.toHaveBeenCalled();
    s.els.cue0.metadata(190);
    expect(s.els.cue0.seeks).toEqual([45]);
    expect(s.els.cue0.play).toHaveBeenCalledTimes(1);
    expect(s.els.cue0.log).toEqual([`src:${url("c1")}`, "seek:45", "play"]);
  });

  it("a fade-in issued with the play waits for the play, so it starts from silence", () => {
    const s = setup();
    s.ctx.currentTime = 5;
    s.driver.run([load("cue0", "c1", 0), play("cue0"), ramp("cue0", 0.9, 2)]);
    expect(s.gain("cue0").ramps()).toEqual([]);
    expect(s.gain("cue0").value).toBe(0);
    s.ctx.currentTime = 5.5;
    s.els.cue0.metadata(190);
    expect(s.gain("cue0").ramps()).toEqual([[0.9, 7.5]]);
  });

  it("play after metadata plays immediately", () => {
    const s = setup();
    s.driver.run([load("cue0", "c1", 3)]);
    s.els.cue0.metadata(190);
    expect(s.els.cue0.play).not.toHaveBeenCalled();
    s.driver.run([play("cue0")]);
    expect(s.els.cue0.play).toHaveBeenCalledTimes(1);
  });

  it("loading a paused deck swaps at once, without a micro-fade", () => {
    const s = setup();
    playing(s, "bg1", "b1", 0.7);
    s.els.bg1.paused = true; // e.g. paused after an earlier fade-out
    s.driver.run([load("bg1", "b2", 0)]);
    expect(s.els.bg1.src).toBe(url("b2"));
    expect(s.gain("bg1").value).toBe(0);
  });

  it("loading a playing deck that is already silent swaps at once", () => {
    const s = setup();
    playing(s, "bg1", "b1", 0.0005);
    s.driver.run([load("bg1", "b2", 0)]);
    expect(s.els.bg1.src).toBe(url("b2"));
  });
});

describe("ruling 2: micro-fade before reloading an audible deck", () => {
  it("fades to 0 over 0.15 s, queues play/ramp, then swaps and applies them", () => {
    const s = setup();
    playing(s, "cue0", "c1", 0.6);
    s.ctx.currentTime = 20;
    s.driver.run([load("cue0", "c2", 7), play("cue0"), ramp("cue0", 1, 2)]);

    // Micro-fade from the current gain; nothing else touched yet.
    expect(s.gain("cue0").calls).toEqual([
      ["cancelScheduledValues", 20],
      ["setValueAtTime", 0.6, 20],
      ["linearRampToValueAtTime", 0, 20.15],
    ]);
    expect(s.els.cue0.src).toBe(url("c1"));
    expect(s.els.cue0.pause).not.toHaveBeenCalled();
    expect(s.els.cue0.play).not.toHaveBeenCalled();

    // A later batch before the swap is queued too.
    vi.advanceTimersByTime(100);
    s.driver.run([ramp("cue0", 0.3, 1)]);
    expect(s.gain("cue0").ramps()).toEqual([[0, 20.15]]);

    vi.advanceTimersByTime(99);
    expect(s.els.cue0.src).toBe(url("c1"));
    s.gain("cue0").value = 0; // the micro-fade has reached 0
    vi.advanceTimersByTime(1);
    expect(s.els.cue0.src).toBe(url("c2"));
    expect(s.els.cue0.log).toEqual(["pause", `src:${url("c2")}`]);
    expect(s.els.cue0.play).not.toHaveBeenCalled(); // still waits for metadata

    s.ctx.currentTime = 20.5;
    s.els.cue0.metadata(150);
    expect(s.els.cue0.log).toEqual(["pause", `src:${url("c2")}`, "seek:7", "play"]);
    expect(s.gain("cue0").ramps()).toEqual([[0, 20.15], [1, 22.5], [0.3, 21.5]]);
    expect(s.gain("cue0").value).toBe(0);
  });

  it("a second load during the micro-fade wins and drops the first load's commands", () => {
    const s = setup();
    playing(s, "cue1", "c1", 0.8);
    s.driver.run([load("cue1", "c2", 0), play("cue1")]);
    vi.advanceTimersByTime(50);
    s.driver.run([load("cue1", "c3", 4)]);
    vi.advanceTimersByTime(150);
    expect(s.els.cue1.srcHistory.slice(-1)).toEqual([url("c3")]);
    expect(s.els.cue1.srcHistory).not.toContain(url("c2"));
    s.els.cue1.metadata(100);
    expect(s.els.cue1.seeks).toEqual([4]);
    expect(s.els.cue1.play).not.toHaveBeenCalled();
  });

  it("the old pause timer does not fire during or after the swap", () => {
    const s = setup();
    playing(s, "cue0", "c1", 0.6);
    s.driver.run([ramp("cue0", 0, 2, true)]); // fading out (still audible)
    vi.advanceTimersByTime(500);
    s.driver.run([load("cue0", "c2", 0), play("cue0"), ramp("cue0", 1, 2)]);
    vi.advanceTimersByTime(200);
    s.els.cue0.metadata(100);
    expect(s.els.cue0.paused).toBe(false);
    s.els.cue0.pause.mockClear();
    vi.advanceTimersByTime(10_000);
    expect(s.els.cue0.pause).not.toHaveBeenCalled();
  });
});

describe("events", () => {
  it("timeupdate on cue0 emits CUE_TIME cue0", () => {
    const s = setup();
    playing(s, "cue0", "c1", 1);
    s.els.cue0.advanceTo(12.5);
    s.els.cue0.fire("timeupdate");
    expect(s.events).toEqual([{ type: "CUE_TIME", deck: "cue0", t: 12.5 }]);
  });

  it("ended on bg1 emits BG_ENDED", () => {
    const s = setup();
    playing(s, "bg1", "b2", 0.7);
    s.els.bg1.fire("ended");
    expect(s.events).toEqual([{ type: "BG_ENDED", deck: "bg1" }]);
  });

  it("timeupdate on bg0 emits BG_TIME with duration; ended on cue1 emits CUE_ENDED", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7, 180);
    playing(s, "cue1", "c1", 1);
    s.els.bg0.advanceTo(33);
    s.els.bg0.fire("timeupdate");
    s.els.cue1.fire("ended");
    expect(s.events).toEqual([
      { type: "BG_TIME", deck: "bg0", t: 33, duration: 180 },
      { type: "CUE_ENDED", deck: "cue1" },
    ]);
  });

  it("onEvent returns an unsubscribe", () => {
    const s = setup();
    playing(s, "cue0", "c1", 1);
    s.off();
    s.els.cue0.fire("ended");
    expect(s.events).toEqual([]);
  });
});

describe("ruling 3: stale events from a previous source are dropped", () => {
  it("late timeupdate/ended after a reload are dropped until the new source is ready", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7);
    s.els.bg0.paused = true;
    s.driver.run([load("bg0", "b2", 10), play("bg0")]);
    // Late events from b1 arriving after the swap.
    s.els.bg0.advanceTo(199);
    s.els.bg0.fire("timeupdate");
    s.els.bg0.fire("ended");
    expect(s.events).toEqual([]);

    s.els.bg0.metadata(180);
    s.els.bg0.advanceTo(10.3);
    s.els.bg0.fire("timeupdate");
    expect(s.events).toEqual([{ type: "BG_TIME", deck: "bg0", t: 10.3, duration: 180 }]);
  });

  it("events from the old source during the micro-fade are dropped", () => {
    const s = setup();
    playing(s, "bg1", "b1", 0.7);
    s.driver.run([load("bg1", "b2", 0), play("bg1")]);
    s.els.bg1.fire("timeupdate");
    s.els.bg1.fire("ended");
    vi.advanceTimersByTime(200);
    s.els.bg1.fire("timeupdate");
    expect(s.events).toEqual([]);
  });

  it("a never-loaded deck emits nothing", () => {
    const s = setup();
    s.els.cue1.fire("timeupdate");
    s.els.cue1.fire("ended");
    expect(s.events).toEqual([]);
  });
});

describe("fix 1: a source that fails is reported as ended", () => {
  it("error during loading with a queued play emits BG_ENDED once and clears the queue", () => {
    const s = setup();
    s.driver.run([load("bg1", "b2", 0), play("bg1"), ramp("bg1", 0.7, 3)]);
    s.els.bg1.fail();
    expect(s.events).toEqual([{ type: "BG_ENDED", deck: "bg1" }]);
    s.els.bg1.fail(); // repeated error, same generation
    s.els.bg1.metadata(100); // even if metadata turned up late, the queued play is gone
    s.els.bg1.fire("ended");
    expect(s.events).toEqual([{ type: "BG_ENDED", deck: "bg1" }]);
    expect(s.els.bg1.play).not.toHaveBeenCalled();
    expect(s.gain("bg1").ramps()).toEqual([]);
  });

  it("error during loading on a cue deck emits CUE_ENDED", () => {
    const s = setup();
    s.driver.run([load("cue1", "c1", 45), play("cue1"), ramp("cue1", 1, 2)]);
    s.els.cue1.fail();
    expect(s.events).toEqual([{ type: "CUE_ENDED", deck: "cue1" }]);
    expect(s.els.cue1.play).not.toHaveBeenCalled();
  });

  it("error while ready emits *_ENDED, and later events from the broken source are dropped", () => {
    const s = setup();
    playing(s, "cue0", "c1", 1);
    s.els.cue0.fail(3); // MEDIA_ERR_DECODE mid-track
    s.els.cue0.fire("timeupdate");
    s.els.cue0.fire("ended");
    expect(s.events).toEqual([{ type: "CUE_ENDED", deck: "cue0" }]);
  });

  it("errors from a previous generation are ignored", () => {
    const s = setup();
    // Old source failing while it is being micro-faded out for a new load.
    playing(s, "bg0", "b1", 0.7);
    s.driver.run([load("bg0", "b2", 0), play("bg0")]);
    s.els.bg0.fail();
    expect(s.events).toEqual([]);
    vi.advanceTimersByTime(200);
    // Late error event from the replaced src (the new src cleared `el.error`).
    s.els.bg0.fire("error");
    expect(s.events).toEqual([]);
    s.els.bg0.metadata(180);
    expect(s.els.bg0.play).toHaveBeenCalledTimes(1);
  });

  it("each new generation can report its own failure once", () => {
    const s = setup();
    s.driver.run([load("bg0", "b1", 0), play("bg0")]);
    s.els.bg0.fail();
    s.driver.run([load("bg0", "b2", 0), play("bg0")]);
    s.els.bg0.fail();
    expect(s.events).toEqual([
      { type: "BG_ENDED", deck: "bg0" },
      { type: "BG_ENDED", deck: "bg0" },
    ]);
  });
});

describe("fix 2: audible check also uses the last ramp target", () => {
  it("micro-fades a playing deck whose engine reports a stale gain of 0 while fading in", () => {
    const s = setup();
    playing(s, "cue0", "c1", 0.8);
    s.gain("cue0").value = 0; // stale reading; last target sent was 0.8
    s.ctx.currentTime = 3;
    s.driver.run([load("cue0", "c2", 0)]);
    expect(s.gain("cue0").ramps()).toEqual([[0, 3.15]]);
    expect(s.els.cue0.src).toBe(url("c1"));
    vi.advanceTimersByTime(200);
    expect(s.els.cue0.src).toBe(url("c2"));
  });
});

describe("ruling 4: deck with no source", () => {
  it("ramp just schedules gain, play is a no-op, pauseAtEnd does not throw", () => {
    const s = setup();
    s.ctx.currentTime = 2;
    expect(() =>
      s.driver.run([ramp("cue1", 0, 1, true), play("cue1"), ramp("bg1", 0.5, 1)]),
    ).not.toThrow();
    expect(s.gain("bg1").ramps()).toEqual([[0.5, 3]]);
    expect(s.gain("cue1").ramps()).toEqual([[0, 3]]);
    expect(s.els.cue1.play).not.toHaveBeenCalled();
    expect(s.els.cue1.srcHistory).toEqual([]);
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});

describe("master", () => {
  it("ramps over 0.2 s from the current value (ruling 5)", () => {
    const s = setup();
    const master = s.ctx.masterGain().gain;
    master.value = 0.8;
    s.ctx.currentTime = 4;
    s.driver.run([{ type: "master", to: 0.5 }]);
    expect(master.calls).toEqual([
      ["cancelScheduledValues", 4],
      ["setValueAtTime", 0.8, 4],
      ["linearRampToValueAtTime", 0.5, 4.2],
    ]);
  });
});

describe("deckInfo", () => {
  it("reports song, time, duration and paused state", () => {
    const s = setup();
    expect(s.driver.deckInfo("bg0")).toEqual({ songId: null, t: 0, duration: 0, paused: true });
    playing(s, "bg0", "b1", 0.7, 200);
    s.els.bg0.advanceTo(42);
    expect(s.driver.deckInfo("bg0")).toEqual({ songId: "b1", t: 42, duration: 200, paused: false });
  });
});

describe("dispose", () => {
  it("clears timers, pauses elements, disconnects nodes and removes listeners", () => {
    const s = setup();
    playing(s, "bg0", "b1", 0.7);
    playing(s, "cue0", "c1", 0.6);
    s.driver.run([ramp("bg0", 0, 2, true), load("cue0", "c2", 0)]);
    s.driver.dispose();
    for (const deck of DECKS) {
      expect(s.els[deck].paused).toBe(true);
      expect(s.els[deck].listenerCount()).toBe(0);
    }
    for (const src of s.ctx.sources) expect(src.disconnect).toHaveBeenCalled();
    for (const g of s.ctx.gains) expect(g.disconnect).toHaveBeenCalled();
    s.els.bg0.pause.mockClear();
    vi.advanceTimersByTime(10_000);
    expect(s.els.bg0.pause).not.toHaveBeenCalled();
    expect(s.els.cue0.src).toBe(url("c1")); // the pending swap never happened
    expect(vi.getTimerCount()).toBe(0);
    expect(() => s.driver.run([play("bg0")])).not.toThrow();
    expect(s.els.bg0.play).not.toHaveBeenCalled();
  });
});
