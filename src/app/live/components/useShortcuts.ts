"use client";

import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  next(): void;
  background(): void;
  fadeStop(): void;
  volume(delta: number): void;
}

export const VOLUME_STEP = 0.05;

/** Typing targets keep their keys (and Space types a space). */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  return Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'));
}

const isSpace = (e: KeyboardEvent) => e.key === " " || e.code === "Space";

/** The letter pressed: the layout's character, or the physical key when an IME reports "Process". */
function letter(e: KeyboardEvent): string | null {
  if (e.key.length === 1) return e.key.toLowerCase();
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Live keyboard shortcuts (spec §6.6): N next cue, B background, F fade out & stop, ↑/↓ master
 * ±0.05. Space is deliberately unassigned and swallowed so it cannot press a focused button.
 * Ignored: typing targets, auto-repeat, and Ctrl/Alt/Meta combinations (browser shortcuts).
 */
export function useShortcuts(h: ShortcutHandlers): void {
  const ref = useRef(h);
  useEffect(() => {
    ref.current = h;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (isSpace(e)) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const handlers = ref.current;
      let action: (() => void) | null = null;
      if (e.key === "ArrowUp") action = () => handlers.volume(VOLUME_STEP);
      else if (e.key === "ArrowDown") action = () => handlers.volume(-VOLUME_STEP);
      else {
        const k = letter(e);
        if (k === "n") action = handlers.next;
        else if (k === "b") action = handlers.background;
        else if (k === "f") action = handlers.fadeStop;
      }
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      action();
    };
    // Chrome/Firefox can activate a focused button on Space keyup: swallow that too.
    const onKeyUp = (e: KeyboardEvent) => {
      if (isSpace(e) && !isEditable(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
