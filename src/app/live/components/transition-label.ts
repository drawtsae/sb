import { fadeIn, fadeOut, resolveTransition } from "@/lib/playback/machine";
import type { Cue, EventSettings, Transition } from "@/lib/types";

export const TRANSITION_LABEL: Record<Transition, string> = {
  crossfade: "Crossfade",
  fade_out_in: "Fade out → In",
};

/** Seconds as shown in a label: `3`, `2.5`. */
const n = (sec: number) => (Number.isInteger(sec) ? String(sec) : sec.toFixed(1));

/**
 * How the script moves into `cues[index]`, e.g. "Crossfade 3s" or "Fade out → In 2s + 2s".
 * For Fade out → In the first part is the previous song cue's fade-out; after a background cue
 * (or as the first cue) the background fades out over the incoming cue's fade-in.
 */
export function transitionLabel(cues: Cue[], index: number, s: EventSettings): string {
  const cue = cues[index];
  if (cue.kind === "background") return "Nhạc nền";
  const inSec = fadeIn(cue, s);
  const t = resolveTransition(cue, s);
  if (t === "crossfade") return `${TRANSITION_LABEL.crossfade} ${n(inSec)}s`;
  const prev = index > 0 ? cues[index - 1] : undefined;
  const outSec = prev?.kind === "song" ? fadeOut(prev, s) : inSec;
  return `${TRANSITION_LABEL.fade_out_in} ${n(outSec)}s + ${n(inSec)}s`;
}
