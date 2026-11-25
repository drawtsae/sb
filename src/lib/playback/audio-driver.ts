/**
 * Web Audio driver (spec §6.5, Task 7). Executes the `Command`s emitted by the pure playback
 * machine and reports element time/ended back as `PlaybackEvent`s.
 *
 * Chain per deck: <audio> → MediaElementAudioSourceNode → deck GainNode (starts at 0)
 * → master GainNode → destination.
 *
 * Anti-goals: an abrupt cut, unintended silence, a volume jump. Hence:
 * - every gain change is a linear ramp starting from the current gain;
 * - a `load` on an audible deck first micro-fades it to 0, then swaps the source;
 * - a `play` waits for the new source's metadata, and fade-ins queued behind it wait too,
 *   so a fade-in always starts from silence;
 * - events from a superseded source are dropped (per-deck generation counter).
 */
import type { Command, Deck, PlaybackEvent } from "./machine";

export interface AudioDriver {
  run(commands: Command[]): void;
  /** CUE_TIME / CUE_ENDED / BG_TIME / BG_ENDED. Returns an unsubscribe. */
  onEvent(cb: (ev: PlaybackEvent) => void): () => void;
  deckInfo(deck: Deck): { songId: string | null; t: number; duration: number; paused: boolean };
  dispose(): void;
}

export interface AudioDriverOptions {
  /** Element factory (tests pass fakes; the app may attach the element to the DOM). */
  createElement?: (deck: Deck) => HTMLAudioElement;
}

/** Fade applied to an audible deck before its source is swapped. */
export const MICRO_FADE_SEC = 0.15;
/** Smoothing applied to every `master` change. */
export const MASTER_RAMP_SEC = 0.2;
/** Margin after a ramp's end before pausing / swapping, so the ramp has surely completed. */
const TIMER_MARGIN_MS = 50;
/** A deck whose gain is at or below this is treated as silent. */
const SILENT_GAIN = 0.001;

const DECKS: Deck[] = ["bg0", "bg1", "cue0", "cue1"];
const isCue = (deck: Deck) => deck === "cue0" || deck === "cue1";

type Timer = ReturnType<typeof setTimeout>;
type DeckCommand = Extract<Command, { type: "play" | "ramp" }>;

/**
 * empty    – never loaded: play is a no-op, ramps only schedule gain.
 * fading   – a load arrived while audible: micro-fading the old source; play/ramp are queued.
 * loading  – new src set, waiting for `loadedmetadata`; play (and anything after it) is queued.
 * ready    – metadata loaded and seeked: commands run directly, events are forwarded.
 */
type Phase = "empty" | "fading" | "loading" | "ready";

interface DeckState {
  deck: Deck;
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  phase: Phase;
  /** Bumped by every `load`; events are only forwarded once this generation is ready. */
  gen: number;
  /** Generation whose source has loaded metadata; equals `gen` exactly when phase is ready. */
  readyGen: number;
  /** Song in the element's current src. */
  songId: string | null;
  /** Load waiting for the micro-fade to finish. */
  pendingLoad: { songId: string; atSec: number } | null;
  /** Seek to apply when the current src's metadata arrives. */
  seekTo: number;
  /** play/ramp commands waiting for the swap or for metadata, in arrival order. */
  queue: DeckCommand[];
  pauseTimer: Timer | null;
  swapTimer: Timer | null;
  listeners: [string, () => void][];
}

export function createAudioDriver(
  ctx: AudioContext,
  resolveUrl: (songId: string) => string,
  opts: AudioDriverOptions = {},
): AudioDriver {
  const subscribers = new Set<(ev: PlaybackEvent) => void>();
  let disposed = false;

  const master = ctx.createGain();
  master.connect(ctx.destination);

  const decks = {} as Record<Deck, DeckState>;
  for (const deck of DECKS) decks[deck] = createDeck(deck);

  function createDeck(deck: Deck): DeckState {
    const el = opts.createElement ? opts.createElement(deck) : new Audio();
    el.preload = "auto";
    el.dataset.deck = deck;
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(master);
    const d: DeckState = {
      deck, el, source, gain, phase: "empty", gen: 0, readyGen: -1, songId: null,
      pendingLoad: null, seekTo: 0, queue: [], pauseTimer: null, swapTimer: null, listeners: [],
    };
    const on = (type: string, fn: () => void) => {
      el.addEventListener(type, fn);
      d.listeners.push([type, fn]);
    };
    on("loadedmetadata", () => onMetadata(d));
    on("timeupdate", () => {
      if (d.readyGen !== d.gen) return; // stale source, or not loaded yet
      emit(isCue(deck) ? { type: "CUE_TIME", deck, t: el.currentTime }
        : { type: "BG_TIME", deck, t: el.currentTime, duration: el.duration });
    });
    on("ended", () => {
      if (d.readyGen !== d.gen) return;
      emit(isCue(deck) ? { type: "CUE_ENDED", deck } : { type: "BG_ENDED", deck });
    });
    return d;
  }

  function emit(ev: PlaybackEvent) {
    for (const cb of [...subscribers]) cb(ev);
  }

  // ---------- gain ----------

  /** cancel → hold current value → linear ramp. Never jumps. */
  function rampParam(param: AudioParam, to: number, seconds: number) {
    const now = ctx.currentTime;
    const from = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    param.linearRampToValueAtTime(to, now + seconds);
  }

  /** Only for a deck that is inaudible (paused or already at ~0). */
  function silence(d: DeckState) {
    const now = ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(0, now);
  }

  function clearPause(d: DeckState) {
    if (d.pauseTimer !== null) clearTimeout(d.pauseTimer);
    d.pauseTimer = null;
  }

  function isAudible(d: DeckState) {
    return !d.el.paused && d.gain.gain.value > SILENT_GAIN;
  }

  // ---------- commands ----------

  function applyRamp(d: DeckState, c: Extract<Command, { type: "ramp" }>) {
    clearPause(d);
    rampParam(d.gain.gain, c.to, c.seconds);
    if (c.pauseAtEnd) {
      d.pauseTimer = setTimeout(() => {
        d.pauseTimer = null;
        d.el.pause();
      }, c.seconds * 1000 + TIMER_MARGIN_MS);
    }
  }

  function startPlayback(d: DeckState) {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const p = d.el.play();
    if (p && typeof p.catch === "function") {
      p.catch((err: unknown) => {
        // AbortError = interrupted by a newer load/pause: expected.
        if ((err as { name?: string } | null)?.name !== "AbortError") {
          console.warn(`[audio-driver] ${d.deck}: play() failed`, err);
        }
      });
    }
  }

  function deckCommand(d: DeckState, c: DeckCommand) {
    clearPause(d); // ruling 1: a play or ramp cancels a pending pauseAtEnd
    switch (d.phase) {
      case "fading":
        d.queue.push(c);
        return;
      case "loading":
        // A play waits for metadata; anything after a waiting play waits with it.
        if (c.type === "play" || d.queue.length > 0) {
          d.queue.push(c);
          return;
        }
        applyRamp(d, c);
        return;
      case "empty":
        if (c.type === "ramp") applyRamp(d, c); // play with no source: no-op
        return;
      case "ready":
        if (c.type === "play") startPlayback(d);
        else applyRamp(d, c);
        return;
    }
  }

  function load(d: DeckState, songId: string, atSec: number) {
    clearPause(d);
    d.gen += 1;
    d.queue = []; // commands for a superseded load are dropped
    d.pendingLoad = { songId, atSec };
    if (d.phase === "fading") return; // micro-fade already running; swap takes the newest load
    if (isAudible(d)) {
      // Ruling 2: never cut an audible deck.
      d.phase = "fading";
      rampParam(d.gain.gain, 0, MICRO_FADE_SEC);
      d.swapTimer = setTimeout(() => {
        d.swapTimer = null;
        swap(d);
      }, MICRO_FADE_SEC * 1000 + TIMER_MARGIN_MS);
      return;
    }
    swap(d);
  }

  /** Inaudible now: pause, pin gain at 0, set the new src, replay queued commands. */
  function swap(d: DeckState) {
    const next = d.pendingLoad;
    if (!next) return;
    d.pendingLoad = null;
    if (!d.el.paused) d.el.pause();
    silence(d);
    d.songId = next.songId;
    d.seekTo = next.atSec;
    d.phase = "loading";
    d.el.src = resolveUrl(next.songId);
    const queued = d.queue;
    d.queue = [];
    for (const c of queued) deckCommand(d, c);
  }

  function onMetadata(d: DeckState) {
    if (d.phase !== "loading") return; // old source finishing during a micro-fade
    d.el.currentTime = d.seekTo;
    d.phase = "ready";
    d.readyGen = d.gen;
    const queued = d.queue;
    d.queue = [];
    for (const c of queued) deckCommand(d, c);
  }

  function run(commands: Command[]) {
    if (disposed) return;
    for (const c of commands) {
      switch (c.type) {
        case "load":
          load(decks[c.deck], c.songId, c.atSec);
          break;
        case "play":
        case "ramp":
          deckCommand(decks[c.deck], c);
          break;
        case "master":
          rampParam(master.gain, c.to, MASTER_RAMP_SEC);
          break;
      }
    }
  }

  return {
    run,
    onEvent(cb) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    deckInfo(deck) {
      const { el, songId } = decks[deck];
      return {
        songId,
        t: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        paused: el.paused,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      subscribers.clear();
      for (const deck of DECKS) {
        const d = decks[deck];
        clearPause(d);
        if (d.swapTimer !== null) clearTimeout(d.swapTimer);
        d.swapTimer = null;
        d.queue = [];
        d.pendingLoad = null;
        for (const [type, fn] of d.listeners) d.el.removeEventListener(type, fn);
        d.listeners = [];
        d.el.pause();
        d.source.disconnect();
        d.gain.disconnect();
      }
      master.disconnect();
    },
  };
}
