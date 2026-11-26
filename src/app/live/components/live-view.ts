/** Pure helpers that turn machine state + deck samples into what the Live screen shows. */
import { effectiveEnd, type PlaybackState } from "@/lib/playback/machine";
import type { Cue, ShowSnapshot, Song } from "@/lib/types";
import type { DeckInfo } from "./useLiveEngine";

/** Whole seconds as m:ss (no tenths: easier to read at a glance). */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface Sample {
  bg: DeckInfo;
  cue: DeckInfo;
}

export interface Progress {
  t: number;
  end: number;
  remaining: number;
  /** 0..1 */
  fraction: number;
}

function progress(t: number, start: number, end: number): Progress {
  const clamped = Math.min(Math.max(t, start), end);
  const span = end - start;
  return {
    t: clamped,
    end,
    remaining: Math.max(0, end - clamped),
    fraction: span > 0 ? (clamped - start) / span : 0,
  };
}

/** The cue currently playing on the cue deck (mode 'cue'), with its song. */
export function playingCue(state: PlaybackState, snap: ShowSnapshot): { cue: Cue; song: Song } | null {
  if (state.mode !== "cue" || state.cue.cueIndex === null) return null;
  const cue = snap.cues[state.cue.cueIndex];
  const song = cue?.songId ? snap.songs[cue.songId] : undefined;
  return cue && song ? { cue, song } : null;
}

/** The background song at the playlist position. */
export function bgSong(state: PlaybackState, snap: ShowSnapshot, offset = 0): Song | null {
  const { order, pos } = state.bg;
  if (order.length === 0) return null;
  const p = pos + offset;
  if (p >= order.length && snap.settings.shuffle) return null; // reshuffled on wrap: not known yet
  const id = snap.background[order[p % order.length]];
  return id ? (snap.songs[id] ?? null) : null;
}

/** Cue progress: t against the effective end (endSec or the song's end). */
export function cueProgress(state: PlaybackState, snap: ShowSnapshot, sample: Sample): Progress | null {
  const p = playingCue(state, snap);
  if (!p) return null;
  // Until the deck reports the new song, show the cue at its start rather than the old deck's time.
  const t = sample.cue.songId === p.song.id && sample.cue.duration > 0 ? sample.cue.t : p.cue.startSec;
  return progress(t, p.cue.startSec, effectiveEnd(p.cue, p.song));
}

/** Background progress: t against the track's duration. */
export function bgProgress(state: PlaybackState, snap: ShowSnapshot, sample: Sample): Progress | null {
  const song = bgSong(state, snap);
  if (!song) return null;
  const loaded = state.bg.started && sample.bg.songId === song.id && sample.bg.duration > 0;
  const t = loaded ? sample.bg.t : (state.bg.resumeAtSec ?? 0);
  const end = loaded ? sample.bg.duration : song.durationSec;
  return progress(t, 0, end);
}

/** Where the background is paused (s), or null when it is playing or never started. */
export function bgPausedAt(state: PlaybackState, snap: ShowSnapshot, sample: Sample): number | null {
  if (state.mode === "background") return null;
  if (!state.bg.started) return state.bg.resumeAtSec;
  const song = bgSong(state, snap);
  return song && sample.bg.songId === song.id ? sample.bg.t : null;
}

/** Index of the cue N would play, or null at the end of the script. */
export function nextCueIndex(state: PlaybackState, snap: ShowSnapshot): number | null {
  const i = state.currentCueIndex === null ? 0 : state.currentCueIndex + 1;
  return i < snap.cues.length ? i : null;
}
