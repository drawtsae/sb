/**
 * Live state saved to localStorage (spec §6.9) so an accidental reload can resume "Tiếp tục từ
 * chỗ cũ". Resuming never plays anything by itself: the restored state is silent.
 */
import { initialState, type PlaybackState } from "@/lib/playback/machine";
import type { AudioDriver } from "@/lib/playback/audio-driver";
import type { ShowSnapshot } from "@/lib/types";

export const LIVE_KEY = (eventId: string) => `sb:live:${eventId}`;

export interface LivePersisted {
  currentCueIndex: number | null;
  playedCueIds: string[];
  bgOrder: number[];
  bgPos: number;
  bgPositionSec: number;
  /** Master volume at save time, so a resume does not jump back to the event default. */
  master?: number;
  /** `takenAt` of the snapshot this was saved with; a re-loaded show makes it stale. */
  snapshotTakenAt?: string;
  savedAt: string;
}

type DeckInfo = ReturnType<AudioDriver["deckInfo"]>;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function saveLive(eventId: string, p: LivePersisted): void {
  try {
    localStorage.setItem(LIVE_KEY(eventId), JSON.stringify(p));
  } catch {
    /* storage full or unavailable: the show goes on without resume */
  }
}

export function clearLive(eventId: string): void {
  try {
    localStorage.removeItem(LIVE_KEY(eventId));
  } catch {
    /* ignore */
  }
}

/**
 * The saved live state for `eventId`. With `snapshotTakenAt`, a state saved with another
 * snapshot (a rehearsal before the show was loaded again) is stale: it is cleared and ignored,
 * since its cue index and background position may point at different cues and tracks.
 */
export function readLive(eventId: string, snapshotTakenAt?: string): LivePersisted | null {
  const p = parseLive(eventId);
  if (p && snapshotTakenAt !== undefined && p.snapshotTakenAt !== snapshotTakenAt) {
    clearLive(eventId);
    return null;
  }
  return p;
}

function parseLive(eventId: string): LivePersisted | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY(eventId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LivePersisted> | null;
    if (!p || typeof p !== "object") return null;
    const ok =
      (p.currentCueIndex === null || (Number.isInteger(p.currentCueIndex) && p.currentCueIndex! >= 0)) &&
      Array.isArray(p.playedCueIds) && p.playedCueIds.every((id) => typeof id === "string") &&
      Array.isArray(p.bgOrder) && p.bgOrder.every((i) => Number.isInteger(i)) &&
      Number.isInteger(p.bgPos) &&
      isNum(p.bgPositionSec) && p.bgPositionSec >= 0 &&
      (p.master === undefined || isNum(p.master)) &&
      (p.snapshotTakenAt === undefined || typeof p.snapshotTakenAt === "string") &&
      typeof p.savedAt === "string";
    return ok ? (p as LivePersisted) : null;
  } catch {
    return null;
  }
}

/** True when `order` is a permutation of 0..count-1. */
function validOrder(order: number[], count: number): boolean {
  if (order.length !== count) return false;
  const seen = new Set(order);
  return seen.size === count && order.every((i) => i >= 0 && i < count);
}

/**
 * Rebuild a machine state from saved data: mode 'silent', background not started and resuming at
 * the saved position. Anything that no longer fits the snapshot (it was reloaded with other cues
 * or tracks) falls back to the fresh value.
 */
export function restoreState(snap: ShowSnapshot, p: LivePersisted, rng: () => number = Math.random): PlaybackState {
  const fresh = initialState(snap, rng);
  const cueIds = new Set(snap.cues.map((c) => c.id));
  const orderOk = validOrder(p.bgOrder, snap.background.length) && p.bgPos >= 0 && p.bgPos < p.bgOrder.length;
  const cueOk = p.currentCueIndex !== null && p.currentCueIndex < snap.cues.length;
  return {
    ...fresh,
    mode: "silent",
    currentCueIndex: cueOk ? p.currentCueIndex : null,
    playedCueIds: p.playedCueIds.filter((id) => cueIds.has(id)),
    bg: orderOk
      ? { ...fresh.bg, order: [...p.bgOrder], pos: p.bgPos, started: false, resumeAtSec: p.bgPositionSec }
      : fresh.bg,
    master: isNum(p.master) ? Math.min(1, Math.max(0, p.master)) : fresh.master,
  };
}

const sameOrder = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * What to save now. The bg position comes from the active bg deck (`info`), but only when that
 * deck really holds the current track with metadata loaded; otherwise keep the last good value
 * for the same track, or 0 for a track that was just loaded from its start.
 */
export function captureLive(
  state: PlaybackState, snap: ShowSnapshot, info: DeckInfo, prev: LivePersisted | null, now: Date = new Date(),
): LivePersisted {
  const { bg } = state;
  let bgPositionSec: number;
  if (!bg.started) {
    bgPositionSec = bg.resumeAtSec ?? 0;
  } else {
    const expected = snap.background[bg.order[bg.pos]];
    const loaded = info.songId !== null && info.songId === expected && info.duration > 0 && isNum(info.t);
    if (loaded) bgPositionSec = Math.max(0, info.t);
    else if (prev && prev.bgPos === bg.pos && sameOrder(prev.bgOrder, bg.order)) bgPositionSec = prev.bgPositionSec;
    else bgPositionSec = 0;
  }
  return {
    currentCueIndex: state.currentCueIndex,
    playedCueIds: [...state.playedCueIds],
    bgOrder: [...bg.order],
    bgPos: bg.pos,
    bgPositionSec,
    master: state.master,
    snapshotTakenAt: snap.takenAt,
    savedAt: now.toISOString(),
  };
}
