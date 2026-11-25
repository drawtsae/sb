/**
 * Hand-written fakes for the Web Audio driver tests (Task 7): AudioContext, GainNode, AudioParam,
 * MediaElementAudioSourceNode and HTMLAudioElement. Only the surface the driver uses is modelled.
 */
import { vi } from "vitest";
import type { Deck } from "@/lib/playback/machine";

export type ParamCall =
  | ["cancelScheduledValues", number]
  | ["setValueAtTime", number, number]
  | ["linearRampToValueAtTime", number, number];

/** `value` only changes through `setValueAtTime` (or a test writing it to simulate elapsed time). */
export class FakeParam {
  calls: ParamCall[] = [];
  constructor(public value: number) {}
  cancelScheduledValues(t: number) {
    this.calls.push(["cancelScheduledValues", t]);
    return this;
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(["setValueAtTime", v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["linearRampToValueAtTime", v, t]);
    return this;
  }
  /** Ramps only: `[to, endTime]` of every `linearRampToValueAtTime`. */
  ramps(): [number, number][] {
    return this.calls.filter((c) => c[0] === "linearRampToValueAtTime").map((c) => [c[1], c[2]!]);
  }
}

class FakeNode {
  connectedTo: unknown[] = [];
  connect = vi.fn((target: unknown) => {
    this.connectedTo.push(target);
    return target;
  });
  disconnect = vi.fn(() => {
    this.connectedTo = [];
  });
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeSource extends FakeNode {
  constructor(public mediaElement: FakeElement) {
    super();
  }
}

type Listener = (ev: { type: string }) => void;

export class FakeElement {
  private _src = "";
  private _currentTime = 0;
  /** Every `src` assignment, in order. */
  srcHistory: string[] = [];
  /** Every `currentTime` assignment (a seek), in order. */
  seeks: number[] = [];
  /** Interleaved log of src/seek/play/pause, to check ordering. */
  log: string[] = [];
  duration = NaN;
  /** MediaError of the current source; a new `src` clears it (as the load algorithm does). */
  error: { code: number } | null = null;
  paused = true;
  preload = "";
  dataset: Record<string, string> = {};
  listeners = new Map<string, Set<Listener>>();

  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    this.srcHistory.push(v);
    this.log.push(`src:${v}`);
    // Media element load algorithm: a new source starts paused with unknown duration.
    this.paused = true;
    this.duration = NaN;
    this.error = null;
    this._currentTime = 0;
  }
  get currentTime() {
    return this._currentTime;
  }
  set currentTime(v: number) {
    this._currentTime = v;
    this.seeks.push(v);
    this.log.push(`seek:${v}`);
  }
  /** Simulate playback progress without recording a seek. */
  advanceTo(t: number) {
    this._currentTime = t;
  }

  play = vi.fn(() => {
    this.paused = false;
    this.log.push("play");
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.log.push("pause");
  });

  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
  fire(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type });
  }
  /** The current source failed (MEDIA_ERR_SRC_NOT_SUPPORTED by default). */
  fail(code = 4) {
    this.error = { code };
    this.fire("error");
  }
  /** The browser finished reading metadata for the current src. */
  metadata(duration: number) {
    this.duration = duration;
    this.fire("loadedmetadata");
  }
}

export class FakeContext {
  currentTime = 0;
  state: "running" | "suspended" | "closed" = "running";
  destination = { kind: "destination" };
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createMediaElementSource(el: FakeElement) {
    const s = new FakeSource(el);
    this.sources.push(s);
    return s;
  }
  /** The gain node a deck's element source feeds. */
  deckGain(el: FakeElement): FakeGain {
    const src = this.sources.find((s) => s.mediaElement === el);
    if (!src) throw new Error("no source for element");
    return src.connectedTo[0] as FakeGain;
  }
  /** The gain node connected to the destination. */
  masterGain(): FakeGain {
    const g = this.gains.find((n) => n.connectedTo.includes(this.destination));
    if (!g) throw new Error("no master gain");
    return g;
  }
}

export const DECKS: Deck[] = ["bg0", "bg1", "cue0", "cue1"];
