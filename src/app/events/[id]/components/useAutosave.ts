"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "saving" | "error";

/**
 * Debounced autosave. `value` changes (after the first render) schedule `save(latest)`
 * after `delayMs`. Status: saved -> saving (pending or in flight) -> saved | error.
 */
export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delayMs = 800,
): { status: SaveStatus; retry: () => void } {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(value);
  const saveRef = useRef(save);
  const first = useRef(true);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback(async () => {
    timer.current = undefined;
    dirty.current = false;
    setStatus("saving");
    try {
      await saveRef.current(latest.current);
      if (!dirty.current) setStatus("saved");
    } catch {
      if (!dirty.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    latest.current = value;
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delayMs);
  }, [value, delayMs, run]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const retry = useCallback(() => {
    clearTimeout(timer.current);
    void run();
  }, [run]);

  return { status, retry };
}
