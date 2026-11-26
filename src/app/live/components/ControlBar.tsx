"use client";

import type { MouseEvent } from "react";
import type { Mode } from "@/lib/playback/machine";
import type { Cue } from "@/lib/types";

/**
 * After a pointer click, drop focus so a stray Enter cannot press the control again (Space is
 * swallowed by the shortcuts). Keyboard-activated clicks (detail 0) keep focus.
 */
export function clickThen(fn: () => void) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0) e.currentTarget.blur();
    fn();
  };
}

const big =
  "flex min-h-20 flex-col items-center justify-center rounded-xl px-4 py-3 text-2xl font-bold " +
  "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-35";

function Key({ k }: { k: string }) {
  return (
    <kbd aria-hidden="true" className="mt-1 rounded border border-current/40 px-1.5 font-mono text-sm font-normal opacity-70">
      {k}
    </kbd>
  );
}

/** Bottom bar (spec §6.6). There is deliberately no instant stop: "Fade out & dừng" always fades. */
export function ControlBar({
  nextCue, mode, hasBackground, disabled, onNext, onBackground, onFadeStop,
}: {
  nextCue: Cue | null;
  mode: Mode;
  hasBackground: boolean;
  disabled: boolean;
  onNext(): void;
  onBackground(): void;
  onFadeStop(): void;
}) {
  const quiet = mode === "idle" || mode === "silent";
  return (
    <nav aria-label="Điều khiển" className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <button
        type="button"
        className={`${big} bg-sky-500 text-black hover:bg-sky-400`}
        disabled={disabled || !nextCue}
        onClick={clickThen(onNext)}
      >
        <span>{nextCue ? `▶ TIẾT MỤC TIẾP: ${nextCue.name}` : "Hết kịch bản"}</span>
        <Key k="N" />
      </button>
      <button
        type="button"
        className={`${big} bg-emerald-500 text-black hover:bg-emerald-400`}
        disabled={disabled || !hasBackground || mode === "background"}
        onClick={clickThen(onBackground)}
      >
        <span>{quiet ? "Phát nhạc nền" : "Về nhạc nền"}</span>
        <Key k="B" />
      </button>
      <button
        type="button"
        className={`${big} bg-red-600 text-white hover:bg-red-500`}
        disabled={disabled || quiet}
        onClick={clickThen(onFadeStop)}
      >
        <span>Fade out &amp; dừng</span>
        <Key k="F" />
      </button>
    </nav>
  );
}
