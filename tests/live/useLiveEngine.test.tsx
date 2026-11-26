import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_FAILED, MISSING_MUSIC, useLiveEngine, type EngineDeps } from "@/app/live/components/useLiveEngine";
import { LIVE_KEY, readLive, restoreState } from "@/lib/offline/live-persist";
import { cacheKey } from "@/lib/offline/music-cache";
import type { AudioDriver } from "@/lib/playback/audio-driver";
import type { PlaybackEvent, PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { SNAP, rng } from "../playback/fixtures";

function fakeCaches(missing: string[] = []) {
  const keys = Object.values(SNAP.songs).filter((s) => !missing.includes(s.id)).map(cacheKey);
  return {
    open: vi.fn(async () => ({
      match: vi.fn(async (k: string) => (keys.includes(k) ? { blob: async () => new Blob([k]) } : undefined)),
    })),
  } as unknown as CacheStorage;
}

/** AudioContext stand-in: resume() reaches "running" unless `stuck`; state changes fire statechange. */
class FakeCtx extends EventTarget {
  state: AudioContextState | "interrupted" = "suspended";
  stuck = false;
  resume = vi.fn(async () => {
    if (!this.stuck) this.setState("running");
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  setState(s: AudioContextState | "interrupted") {
    this.state = s;
    this.dispatchEvent(new Event("statechange"));
  }
}

function setup(opts: { missing?: string[]; snap?: ShowSnapshot; initial?: PlaybackState } = {}) {
  let emit: (ev: PlaybackEvent) => void = () => {};
  const info = { songId: null as string | null, t: 0, duration: 0, paused: true };
  const driver = {
    run: vi.fn(),
    onEvent: vi.fn((cb: (ev: PlaybackEvent) => void) => {
      emit = cb;
      return vi.fn();
    }),
    deckInfo: vi.fn(() => ({ ...info })),
    dispose: vi.fn(),
  } satisfies AudioDriver;
  const ctx = new FakeCtx();
  let n = 0;
  const deps: Partial<EngineDeps> = {
    caches: () => fakeCaches(opts.missing),
    createContext: vi.fn(() => ctx as unknown as AudioContext),
    createDriver: vi.fn(() => driver),
    createObjectURL: vi.fn(() => `blob:test/${++n}`),
    revokeObjectURL: vi.fn(),
    rng,
  };
  const hook = renderHook(() => useLiveEngine(opts.snap ?? SNAP, { deps, initial: opts.initial }));
  return { hook, driver, ctx, deps, info, emit: (ev: PlaybackEvent) => act(() => emit(ev)), emitRaw: (ev: PlaybackEvent) => emit(ev) };
}

/** Polls with real setTimeout (setInterval may be faked) until `cond` holds. */
async function until(cond: () => boolean) {
  for (let i = 0; i < 50 && !cond(); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  expect(cond()).toBe(true);
}

async function started(s: ReturnType<typeof setup>) {
  await until(() => s.hook.result.current.ready);
  await act(async () => {
    await s.hook.result.current.start();
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup(); // globals: false → no automatic RTL cleanup
  vi.useRealTimers();
});

describe("useLiveEngine", () => {
  it("builds an object URL per snapshot song before ready, and resolveUrl returns them", async () => {
    const s = setup();
    expect(s.hook.result.current.ready).toBe(false);
    await started(s);
    expect(s.deps.createObjectURL).toHaveBeenCalledTimes(3);
    const [, resolveUrl] = vi.mocked(s.deps.createDriver!).mock.calls[0];
    expect(["b1", "b2", "c1"].map(resolveUrl).sort()).toEqual(["blob:test/1", "blob:test/2", "blob:test/3"]);
  });

  it("start creates and resumes the context, creates the driver, then sends the initial master", async () => {
    const s = setup();
    await started(s);
    expect(s.deps.createContext).toHaveBeenCalledTimes(1);
    expect(s.ctx.resume).toHaveBeenCalled();
    expect(s.deps.createDriver).toHaveBeenCalledTimes(1);
    expect(s.driver.run.mock.calls[0][0]).toEqual([{ type: "master", to: SNAP.settings.masterVolume }]);
    expect(s.hook.result.current.started).toBe(true);
    // A second start (double click on the overlay) does nothing.
    await act(async () => {
      await s.hook.result.current.start();
    });
    expect(s.deps.createDriver).toHaveBeenCalledTimes(1);
  });

  it("dispatch forwards reducer commands to driver.run (GO_CUE 1 → load cue0)", async () => {
    const s = setup();
    await started(s);
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    const cmds = s.driver.run.mock.calls.at(-1)![0];
    expect(cmds).toContainEqual({ type: "load", deck: "cue0", songId: "c1", atSec: 45 });
    expect(cmds).toContainEqual({ type: "play", deck: "cue0" });
    expect(s.hook.result.current.state.mode).toBe("cue");
    expect(s.hook.result.current.state.currentCueIndex).toBe(1);
  });

  it("driver events go through the reducer (cue reaching its end resumes the background)", async () => {
    const s = setup();
    await started(s);
    act(() => s.hook.result.current.dispatch({ type: "START_BACKGROUND" }));
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    s.emit({ type: "CUE_ENDED", deck: "cue0" });
    expect(s.hook.result.current.state.mode).toBe("background");
    expect(s.driver.run.mock.calls.at(-1)![0]).toContainEqual({ type: "play", deck: "bg0" });
  });

  it("dispatch before start does nothing (no state without audio)", async () => {
    const s = setup();
    await until(() => s.hook.result.current.ready);
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    expect(s.hook.result.current.state.mode).toBe("idle");
    expect(s.driver.run).not.toHaveBeenCalled();
  });

  it("missing cached blob sets error, not ready, and start does nothing", async () => {
    const s = setup({ missing: ["c1"] });
    await until(() => s.hook.result.current.error !== null);
    expect(s.hook.result.current.error).toBe(MISSING_MUSIC);
    expect(MISSING_MUSIC).toBe("Thiếu nhạc trong bộ nhớ — quay lại Kiểm tra & nạp");
    expect(s.hook.result.current.ready).toBe(false);
    await act(async () => {
      await s.hook.result.current.start();
    });
    expect(s.deps.createContext).not.toHaveBeenCalled();
    // URLs already built for the other songs are released.
    expect(vi.mocked(s.deps.revokeObjectURL!).mock.calls.length).toBe(vi.mocked(s.deps.createObjectURL!).mock.calls.length);
  });

  it("starts from a restored state", async () => {
    const initial = restoreState(SNAP, {
      currentCueIndex: 1, playedCueIds: ["q0", "q1"], bgOrder: [0, 1], bgPos: 1, bgPositionSec: 30, savedAt: "x",
    });
    const s = setup({ initial });
    await started(s);
    expect(s.hook.result.current.state.mode).toBe("silent");
    act(() => s.hook.result.current.dispatch({ type: "START_BACKGROUND" }));
    expect(s.driver.run.mock.calls.at(-1)![0][0]).toEqual({ type: "load", deck: "bg0", songId: "b2", atSec: 30 });
  });

  it("saves on every cue change and every 5 s, with the bg position from deckInfo", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const s = setup();
    await started(s);
    expect(readLive(SNAP.eventId)).toBeNull(); // nothing played yet: nothing to resume
    act(() => s.hook.result.current.dispatch({ type: "START_BACKGROUND" }));
    Object.assign(s.info, { songId: "b1", t: 12, duration: 200, paused: false });
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    expect(readLive(SNAP.eventId)).toMatchObject({ currentCueIndex: 1, playedCueIds: ["q1"], bgPositionSec: 12 });
    Object.assign(s.info, { t: 14 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(readLive(SNAP.eventId)?.bgPositionSec).toBe(14);
    expect(s.driver.deckInfo).toHaveBeenCalledWith("bg0");
  });

  it("unmount disposes the driver, closes the context and revokes the URLs", async () => {
    const s = setup();
    await started(s);
    s.hook.unmount();
    expect(s.driver.dispose).toHaveBeenCalledTimes(1);
    expect(s.ctx.close).toHaveBeenCalledTimes(1);
    expect(vi.mocked(s.deps.revokeObjectURL!).mock.calls.map((c) => c[0]).sort())
      .toEqual(["blob:test/1", "blob:test/2", "blob:test/3"]);
    expect(localStorage.getItem(LIVE_KEY(SNAP.eventId))).toBeNull();
  });

  it("stores the snapshot's takenAt with every save", async () => {
    const s = setup();
    await started(s);
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    expect(readLive(SNAP.eventId)?.snapshotTakenAt).toBe(SNAP.takenAt);
  });

  it("clearSaved (deliberate exit) clears the saved state and stops saving", async () => {
    const s = setup();
    await started(s);
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    expect(readLive(SNAP.eventId)).not.toBeNull();
    act(() => s.hook.result.current.clearSaved());
    expect(readLive(SNAP.eventId)).toBeNull();
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 2 }));
    window.dispatchEvent(new Event("pagehide"));
    s.hook.unmount();
    expect(readLive(SNAP.eventId)).toBeNull();
  });

  it("a dispatch nested inside driver.run is not overwritten by the outer one", async () => {
    const s = setup();
    await started(s);
    act(() => s.hook.result.current.dispatch({ type: "START_BACKGROUND" }));
    // The driver reports the cue as ended while still running the GO_CUE commands.
    s.driver.run.mockImplementationOnce(() => {
      s.emitRaw({ type: "CUE_ENDED", deck: "cue0" });
    });
    act(() => s.hook.result.current.dispatch({ type: "GO_CUE", index: 1 }));
    expect(s.hook.result.current.getState().mode).toBe("background");
    expect(s.hook.result.current.state.mode).toBe("background");
  });

  it("AudioContext failure: error, then start again (Thử lại) clears it and starts", async () => {
    const s = setup();
    const create = vi.mocked(s.deps.createContext!);
    create.mockImplementationOnce(() => {
      throw new Error("no audio");
    });
    await until(() => s.hook.result.current.ready);
    await act(async () => {
      await s.hook.result.current.start();
    });
    expect(s.hook.result.current.error).toBe(AUDIO_FAILED);
    expect(s.hook.result.current.started).toBe(false);
    await act(async () => {
      await s.hook.result.current.start();
    });
    expect(s.hook.result.current.error).toBeNull();
    expect(s.hook.result.current.started).toBe(true);
  });

  it("a context suspended/interrupted mid-show is resumed: every 1 s x10, then every 5 s; flagged until running", async () => {
    const s = setup();
    await started(s);
    expect(s.hook.result.current.audioSuspended).toBe(false);
    const base = s.ctx.resume.mock.calls.length;
    vi.useFakeTimers();
    s.ctx.stuck = true;
    act(() => s.ctx.setState("interrupted"));
    expect(s.hook.result.current.audioSuspended).toBe(true);
    expect(s.ctx.resume.mock.calls.length - base).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * 1000);
    });
    expect(s.ctx.resume.mock.calls.length - base).toBe(10);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(s.ctx.resume.mock.calls.length - base).toBe(10); // now every 5 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(s.ctx.resume.mock.calls.length - base).toBe(11);
    // The banner click resumes inside the user gesture.
    s.ctx.stuck = false;
    await act(async () => {
      s.hook.result.current.resumeAudio();
    });
    expect(s.hook.result.current.audioSuspended).toBe(false);
    const after = s.ctx.resume.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(s.ctx.resume.mock.calls.length).toBe(after);
    // Suspended again later: retries start over at 1 s.
    s.ctx.stuck = true;
    act(() => s.ctx.setState("suspended"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(s.ctx.resume.mock.calls.length - after).toBe(2);
  });

  it("unmount mid-show (browser Back) fades everything out before disposing: never a cut", async () => {
    const s = setup();
    await started(s);
    act(() => s.hook.result.current.dispatch({ type: "START_BACKGROUND" }));
    vi.useFakeTimers();
    s.hook.unmount();
    const last = s.driver.run.mock.calls.at(-1)![0];
    expect(last).toContainEqual({ type: "ramp", deck: "bg0", to: 0, seconds: SNAP.settings.stopFadeSec, pauseAtEnd: true });
    expect(s.driver.dispose).not.toHaveBeenCalled();
    expect(s.deps.revokeObjectURL).not.toHaveBeenCalled(); // the fading deck still reads its blob
    expect(readLive(SNAP.eventId)?.currentCueIndex).toBeNull(); // saved before leaving
    await vi.advanceTimersByTimeAsync(SNAP.settings.stopFadeSec * 1000 + 300);
    expect(s.driver.dispose).toHaveBeenCalledTimes(1);
    expect(s.ctx.close).toHaveBeenCalledTimes(1);
    expect(s.deps.revokeObjectURL).toHaveBeenCalledTimes(3);
  });
});
