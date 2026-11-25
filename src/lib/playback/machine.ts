/**
 * Pure playback state machine (spec §6.5). `reduce` decides every fade and switch and emits
 * commands for the Web Audio driver (Task 7). Priority: no unintended silence, no abrupt cuts.
 */
import type { Cue, EventSettings, ShowSnapshot, Song } from "@/lib/types";
import { buildOrder, nextPosition } from "./background-order";

export type Deck = "bg0" | "bg1" | "cue0" | "cue1";
export type Command =
  | { type: "load"; deck: Deck; songId: string; atSec: number } // set src + seek; gain stays 0
  | { type: "play"; deck: Deck }
  | { type: "ramp"; deck: Deck; to: number; seconds: number; pauseAtEnd?: boolean }
  | { type: "master"; to: number };
export type Mode = "idle" | "background" | "cue" | "silent";
type BgDeck = "bg0" | "bg1";
type CueDeck = "cue0" | "cue1";
export interface PlaybackState {
  mode: Mode; currentCueIndex: number | null; playedCueIds: string[];
  bg: { order: number[]; pos: number; activeDeck: BgDeck; started: boolean; crossfading: boolean;
        fadingDeck: BgDeck | null; resumeAtSec: number | null };
  cue: { activeDeck: CueDeck; cueIndex: number | null; ending: boolean };
  master: number;
}
export type PlaybackEvent =
  | { type: "START_BACKGROUND" } | { type: "BACK_TO_BACKGROUND" }
  | { type: "GO_CUE"; index: number } | { type: "NEXT_CUE" } | { type: "FADE_STOP" }
  | { type: "CUE_TIME"; deck: Deck; t: number } | { type: "CUE_ENDED"; deck: Deck }
  | { type: "BG_TIME"; deck: Deck; t: number; duration: number } | { type: "BG_ENDED"; deck: Deck }
  | { type: "SET_MASTER"; to: number };

type Result = { state: PlaybackState; commands: Command[] };
type Rng = () => number;

export function effectiveEnd(cue: Cue, song: Song): number {
  return cue.endSec ?? song.durationSec;
}
export function fadeIn(cue: Cue, s: EventSettings): number {
  return cue.fadeInSec ?? s.cueFadeSec;
}
export function fadeOut(cue: Cue, s: EventSettings): number {
  return cue.fadeOutSec ?? s.cueFadeSec;
}

export function initialState(snap: ShowSnapshot, rng: Rng = Math.random): PlaybackState {
  return {
    mode: "idle",
    currentCueIndex: null,
    playedCueIds: [],
    bg: {
      order: buildOrder(snap.background.length, snap.settings.shuffle, rng),
      pos: 0, activeDeck: "bg0", started: false, crossfading: false, fadingDeck: null, resumeAtSec: null,
    },
    cue: { activeDeck: "cue0", cueIndex: null, ending: false },
    master: snap.settings.masterVolume,
  };
}

// ---------- small helpers ----------

/** Every ramp lasts at least 0.1 s, so nothing is ever cut abruptly. */
const dur = (x: number) => Math.max(0.1, x);
const ramp = (deck: Deck, to: number, seconds: number, pauseAtEnd = false): Command =>
  pauseAtEnd ? { type: "ramp", deck, to, seconds: dur(seconds), pauseAtEnd }
    : { type: "ramp", deck, to, seconds: dur(seconds) };
const otherBg = (d: BgDeck): BgDeck => (d === "bg0" ? "bg1" : "bg0");
const otherCue = (d: CueDeck): CueDeck => (d === "cue0" ? "cue1" : "cue0");
const noop = (state: PlaybackState): Result => ({ state, commands: [] });

/** The song cue currently on the active cue deck, if it is still audible (not ending). */
function playingCue(state: PlaybackState, snap: ShowSnapshot): Cue | null {
  if (state.mode !== "cue" || state.cue.ending || state.cue.cueIndex === null) return null;
  return snap.cues[state.cue.cueIndex] ?? null;
}

function markCue(state: PlaybackState, index: number, cueId: string): PlaybackState {
  const played = state.playedCueIds.includes(cueId) ? state.playedCueIds : [...state.playedCueIds, cueId];
  return { ...state, currentCueIndex: index, playedCueIds: played };
}

/** Fade every audible background deck to 0 and pause; clears crossfade flags. */
function fadeOutBg(state: PlaybackState, seconds: number): Result {
  const { bg } = state;
  const commands = [ramp(bg.activeDeck, 0, seconds, true)];
  if (bg.crossfading && bg.fadingDeck) commands.push(ramp(bg.fadingDeck, 0, seconds, true));
  return { state: { ...state, bg: { ...bg, crossfading: false, fadingDeck: null } }, commands };
}

/** Fade the active cue out (if audible) and mark it ending. Returns the fade used, or null. */
function endCue(state: PlaybackState, snap: ShowSnapshot): Result & { fade: number | null } {
  const cue = playingCue(state, snap);
  if (!cue) return { state, commands: [], fade: null };
  const fade = fadeOut(cue, snap.settings);
  return {
    state: { ...state, cue: { ...state.cue, ending: true } },
    commands: [ramp(state.cue.activeDeck, 0, fade, true)],
    fade,
  };
}

/** Bring the background up over `seconds`; empty playlist → silent. Caller ensures mode ≠ background. */
function resumeBg(state: PlaybackState, snap: ShowSnapshot, seconds: number): Result {
  const { bg } = state;
  if (snap.background.length === 0 || bg.order.length === 0) {
    return { state: { ...state, mode: "silent" }, commands: [] };
  }
  const deck = bg.activeDeck;
  const target = ramp(deck, snap.settings.bgVolume, seconds);
  if (bg.started) {
    return { state: { ...state, mode: "background" }, commands: [{ type: "play", deck }, target] };
  }
  const songId = snap.background[bg.order[bg.pos]];
  return {
    state: { ...state, mode: "background", bg: { ...bg, started: true, resumeAtSec: null } },
    commands: [{ type: "load", deck, songId, atSec: bg.resumeAtSec ?? 0 }, { type: "play", deck }, target],
  };
}

/** Leave whatever is playing and go to the background (BACK_TO_BACKGROUND, cue end, bg-kind cue). */
function toBackground(state: PlaybackState, snap: ShowSnapshot): Result {
  if (state.mode === "background") return noop(state);
  const ended = endCue(state, snap);
  const resumed = resumeBg(ended.state, snap, ended.fade ?? snap.settings.cueFadeSec);
  return { state: resumed.state, commands: [...ended.commands, ...resumed.commands] };
}

/** Advance the playlist and crossfade onto the other bg deck. */
function crossfadeBg(state: PlaybackState, snap: ShowSnapshot, rng: Rng): Result {
  const { bg } = state;
  const next = nextPosition(bg.order, bg.pos, snap.settings.shuffle, rng);
  if (next.order.length === 0) return noop(state);
  const from = bg.activeDeck;
  const to = otherBg(from);
  const secs = snap.settings.bgCrossfadeSec;
  return {
    state: { ...state, bg: { ...bg, order: next.order, pos: next.pos, activeDeck: to, crossfading: true, fadingDeck: from } },
    commands: [
      { type: "load", deck: to, songId: snap.background[next.order[next.pos]], atSec: 0 },
      { type: "play", deck: to },
      ramp(to, snap.settings.bgVolume, secs),
      ramp(from, 0, secs, true),
    ],
  };
}

// ---------- event handlers ----------

function goCue(state: PlaybackState, index: number, snap: ShowSnapshot): Result {
  const cue = snap.cues[index];
  if (!cue) return noop(state);
  if (cue.kind === "background") return toBackground(markCue(state, index, cue.id), snap);

  const song = cue.songId ? snap.songs[cue.songId] : undefined;
  if (!song) return noop(state);

  const commands: Command[] = [];
  let s = state;
  if (s.mode === "background") {
    const out = fadeOutBg(s, fadeIn(cue, snap.settings));
    s = out.state;
    commands.push(...out.commands);
  } else {
    const out = endCue(s, snap);
    s = out.state;
    commands.push(...out.commands);
  }
  // First cue ever uses the initial deck; afterwards always alternate so a fading cue is never cut.
  const deck = s.cue.cueIndex === null ? s.cue.activeDeck : otherCue(s.cue.activeDeck);
  commands.push(
    { type: "load", deck, songId: song.id, atSec: cue.startSec },
    { type: "play", deck },
    ramp(deck, cue.volume / 100, fadeIn(cue, snap.settings)),
  );
  s = markCue(s, index, cue.id);
  return { state: { ...s, mode: "cue", cue: { activeDeck: deck, cueIndex: index, ending: false } }, commands };
}

function finishCue(state: PlaybackState, snap: ShowSnapshot): Result {
  const cue = playingCue(state, snap);
  if (!cue) return noop(state);
  if (cue.onEnd === "resume_background") return toBackground(state, snap);
  const ended = endCue(state, snap);
  return { state: { ...ended.state, mode: "silent" }, commands: ended.commands };
}

function onCueTime(state: PlaybackState, deck: Deck, t: number, snap: ShowSnapshot): Result {
  if (deck !== state.cue.activeDeck) return noop(state);
  const cue = playingCue(state, snap);
  const song = cue?.songId ? snap.songs[cue.songId] : undefined;
  if (!cue || !song) return noop(state);
  if (t < effectiveEnd(cue, song) - fadeOut(cue, snap.settings)) return noop(state);
  return finishCue(state, snap);
}

function onBgTime(state: PlaybackState, deck: Deck, t: number, duration: number, snap: ShowSnapshot, rng: Rng): Result {
  const { bg } = state;
  if (state.mode !== "background" || deck !== bg.activeDeck) return noop(state);
  const xf = snap.settings.bgCrossfadeSec;
  let s = state;
  if (bg.crossfading && t >= xf) s = { ...s, bg: { ...bg, crossfading: false, fadingDeck: null } };
  if (s.bg.crossfading || !Number.isFinite(duration) || duration <= 0 || t < duration - xf) {
    return { state: s, commands: [] };
  }
  return crossfadeBg(s, snap, rng);
}

function onBgEnded(state: PlaybackState, deck: Deck, snap: ShowSnapshot, rng: Rng): Result {
  const { bg } = state;
  if (deck !== bg.activeDeck || !bg.started) return noop(state);
  if (state.mode === "background") return crossfadeBg(state, snap, rng);
  // Track ran out while faded/paused for a cue or a stop: next resume loads the next track.
  const next = nextPosition(bg.order, bg.pos, snap.settings.shuffle, rng);
  return {
    state: { ...state, bg: { ...bg, order: next.order, pos: next.pos, started: false,
                             crossfading: false, fadingDeck: null, resumeAtSec: null } },
    commands: [],
  };
}

function fadeStop(state: PlaybackState, snap: ShowSnapshot): Result {
  const secs = snap.settings.stopFadeSec;
  if (state.mode === "background") {
    const out = fadeOutBg(state, secs);
    return { state: { ...out.state, mode: "silent" }, commands: out.commands };
  }
  if (state.mode === "cue") {
    return {
      state: { ...state, mode: "silent", cue: { ...state.cue, ending: true } },
      commands: [ramp(state.cue.activeDeck, 0, secs, true)],
    };
  }
  return noop(state);
}

function setMaster(state: PlaybackState, to: number): Result {
  if (!Number.isFinite(to)) return noop(state);
  const master = Math.min(1, Math.max(0, to));
  return { state: { ...state, master }, commands: [{ type: "master", to: master }] };
}

export function reduce(
  state: PlaybackState, ev: PlaybackEvent, snap: ShowSnapshot, rng: Rng = Math.random,
): Result {
  switch (ev.type) {
    case "START_BACKGROUND":
    case "BACK_TO_BACKGROUND":
      return toBackground(state, snap);
    case "GO_CUE":
      return goCue(state, ev.index, snap);
    case "NEXT_CUE": {
      const index = state.currentCueIndex === null ? 0 : state.currentCueIndex + 1;
      return index < snap.cues.length ? goCue(state, index, snap) : noop(state);
    }
    case "FADE_STOP":
      return fadeStop(state, snap);
    case "CUE_TIME":
      return onCueTime(state, ev.deck, ev.t, snap);
    case "CUE_ENDED":
      return ev.deck === state.cue.activeDeck ? finishCue(state, snap) : noop(state);
    case "BG_TIME":
      return onBgTime(state, ev.deck, ev.t, ev.duration, snap, rng);
    case "BG_ENDED":
      return onBgEnded(state, ev.deck, snap, rng);
    case "SET_MASTER":
      return setMaster(state, ev.to);
  }
}
