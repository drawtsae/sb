"use client";

import type { MouseEvent } from "react";
import { ArrowLeftRight, Music2, Square, Volume2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { Mode } from "@/lib/playback/machine";
import type { EventSettings, ShowSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TRANSITION_LABEL, transitionLabel } from "./transition-label";

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

/** A big Live control: the shared button look (10 px radius, focus ring, 150 ms), taller and wrapping. */
export const bigButton =
  "h-auto min-h-16 w-full gap-3 whitespace-normal px-5 py-3 text-xl font-bold [&_svg:not([class*='size-'])]:size-6";

/** The shortcut key, shown on the control but not part of its accessible name. */
export function Key({ k }: { k: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="rounded-md border border-current/40 px-1.5 font-mono text-sm font-medium opacity-80"
    >
      {k}
    </kbd>
  );
}

/** Master volume (top bar): the only volume the operator changes during the show. */
export function MasterVolume({
  value, disabled, onChange,
}: { value: number; disabled: boolean; onChange(to: number): void }) {
  const pct = Math.round(value * 100);
  return (
    <label className="flex min-h-11 min-w-0 items-center gap-3">
      <Volume2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-sm text-muted-foreground">Âm lượng tổng</span>
      <input
        type="range"
        aria-label="Âm lượng tổng"
        min={0}
        max={100}
        step={1}
        value={pct}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        // Drop focus after a mouse/touch drag so the slider does not keep keyboard focus.
        onPointerUp={(e) => e.currentTarget.blur()}
        className="h-11 w-28 min-w-0 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50 sm:w-40"
      />
      <span className="w-11 text-right text-sm font-semibold tabular-nums">{pct}%</span>
    </label>
  );
}

/** TIẾP THEO (gold): the cue N would start, how it comes in, and the button that starts it. */
export function NextCue({
  snap, index, disabled, onNext,
}: { snap: ShowSnapshot; index: number | null; disabled: boolean; onNext(): void }) {
  const cue = index !== null ? snap.cues[index] : undefined;
  return (
    <section
      data-testid="next-cue"
      aria-labelledby="next-cue-h"
      className="flex flex-col gap-3 rounded-2xl border-2 border-gold/70 bg-card p-5 shadow-sm"
    >
      <h2 id="next-cue-h" className="text-sm font-bold tracking-widest text-gold">
        TIẾP THEO
      </h2>
      {cue && index !== null ? (
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold leading-tight">
            {index + 1}. {cue.name}
          </p>
          <p className="text-lg text-muted-foreground">Kiểu: {transitionLabel(snap.cues, index, snap.settings)}</p>
        </div>
      ) : (
        <p className="text-2xl font-bold text-muted-foreground">Hết kịch bản</p>
      )}
      <button
        type="button"
        className={cn(
          buttonVariants(),
          bigButton,
          "mt-auto bg-gold text-gold-foreground hover:bg-gold/85 focus-visible:ring-gold/60",
        )}
        disabled={disabled || !cue}
        onClick={clickThen(onNext)}
      >
        <ArrowLeftRight aria-hidden="true" />
        <span>Chuyển bài ngay</span>
        <Key k="N" />
      </button>
    </section>
  );
}

/**
 * ĐIỀU KHIỂN NHANH (spec §6.6). There is deliberately no instant stop: "Fade out & dừng" always
 * fades.
 */
export function ControlBar({
  settings, mode, hasBackground, disabled, onBackground, onFadeStop,
}: {
  settings: EventSettings;
  mode: Mode;
  hasBackground: boolean;
  disabled: boolean;
  onBackground(): void;
  onFadeStop(): void;
}) {
  const quiet = mode === "idle" || mode === "silent";
  // Legacy snapshots have no defaultTransition: the machine falls back to crossfade.
  const def = TRANSITION_LABEL[settings.defaultTransition ?? "crossfade"];
  return (
    <nav
      aria-label="Điều khiển"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <h2 className="text-sm font-bold tracking-widest text-muted-foreground">ĐIỀU KHIỂN NHANH</h2>
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_1fr_auto]">
        <button
          type="button"
          className={cn(buttonVariants(), bigButton)}
          disabled={disabled || !hasBackground || mode === "background"}
          onClick={clickThen(onBackground)}
        >
          <Music2 aria-hidden="true" />
          <span>{quiet ? "Phát nhạc nền" : "Về nhạc nền"}</span>
          <Key k="B" />
        </button>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "destructive" }),
            bigButton,
            "border-destructive/60 bg-destructive-surface hover:bg-destructive-surface/70 dark:bg-destructive-surface dark:hover:bg-destructive-surface/70",
          )}
          disabled={disabled || quiet}
          onClick={clickThen(onFadeStop)}
        >
          <Square aria-hidden="true" />
          <span>Fade out &amp; dừng</span>
          <Key k="F" />
        </button>
        <p className="text-base text-muted-foreground md:px-2">Kiểu chuyển mặc định: {def}</p>
      </div>
    </nav>
  );
}
