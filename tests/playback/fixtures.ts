import { DEFAULT_SETTINGS, type Cue, type ShowSnapshot, type Song } from "@/lib/types";
import {
  initialState,
  reduce,
  type Command,
  type Deck,
  type PlaybackEvent,
  type PlaybackState,
} from "@/lib/playback/machine";

function song(id: string, durationSec: number): Song {
  return {
    id, folderId: null, title: id, artist: null, durationSec,
    fileName: `${id}.mp3`, fileSize: 1000, mimeType: "audio/mpeg", contentHash: `hash-${id}`,
  };
}

function cue(partial: Partial<Cue> & Pick<Cue, "id" | "position" | "kind" | "name">): Cue {
  return {
    songId: null, startSec: 0, endSec: null, fadeInSec: null, fadeOutSec: null,
    volume: 100, onEnd: "resume_background", note: "", transition: null, ...partial,
  };
}

export const SNAP: ShowSnapshot = {
  version: 1,
  eventId: "e1",
  eventName: "Test wedding",
  takenAt: "2026-11-25T00:00:00.000Z",
  settings: { ...DEFAULT_SETTINGS },
  songs: { b1: song("b1", 200), b2: song("b2", 180), c1: song("c1", 190) },
  background: ["b1", "b2"],
  cues: [
    cue({ id: "q0", position: 0, kind: "background", name: "Đón khách" }),
    cue({
      id: "q1", position: 1, kind: "song", name: "Cô dâu chú rể vào",
      songId: "c1", startSec: 45, onEnd: "resume_background",
    }),
    cue({
      id: "q2", position: 2, kind: "song", name: "Cảm ơn bố mẹ",
      songId: "c1", startSec: 0, endSec: 60, fadeOutSec: 5, onEnd: "stop",
    }),
  ],
};

export const rng = () => 0;

export interface RunResult {
  state: PlaybackState;
  /** Commands emitted by the last event. */
  commands: Command[];
  /** Commands emitted by each event, in order. */
  log: Command[][];
}

/** Fold `reduce` over `events`, starting from `init` (default: initialState(snap)). */
export function run(
  events: PlaybackEvent[],
  init?: PlaybackState,
  snap: ShowSnapshot = SNAP,
): RunResult {
  let state = init ?? initialState(snap, rng);
  const log: Command[][] = [];
  for (const ev of events) {
    const out = reduce(state, ev, snap, rng);
    state = out.state;
    log.push(out.commands);
  }
  return { state, commands: log.at(-1) ?? [], log };
}

export const load = (deck: Deck, songId: string, atSec: number): Command =>
  ({ type: "load", deck, songId, atSec });
export const play = (deck: Deck): Command => ({ type: "play", deck });
export const ramp = (deck: Deck, to: number, seconds: number, pauseAtEnd?: boolean): Command =>
  pauseAtEnd ? { type: "ramp", deck, to, seconds, pauseAtEnd } : { type: "ramp", deck, to, seconds };

export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}
