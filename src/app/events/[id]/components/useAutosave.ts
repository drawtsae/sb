"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "saving" | "error";

/**
 * Debounced autosave. `value` changes (after the first render) schedule `save(latest)`
 * after `delayMs`. Status: saved -> saving (pending or in flight) -> saved | error.
 * `flush()` saves a pending (or failed) value now and resolves true once the latest value is
 * saved, false if that save failed.
 */
export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delayMs = 800,
): { status: SaveStatus; retry: () => void; flush: () => Promise<boolean> } {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(value);
  const saveRef = useRef(save);
  const first = useRef(true);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The latest save started, and whether the last one to finish failed. */
  const inflight = useRef<Promise<boolean> | null>(null);
  const failed = useRef(false);

  const run = useCallback((): Promise<boolean> => {
    timer.current = undefined;
    dirty.current = false;
    setStatus("saving");
    const p = (async () => {
      try {
        await saveRef.current(latest.current);
        failed.current = false;
        if (!dirty.current) setStatus("saved");
        return true;
      } catch {
        failed.current = true;
        if (!dirty.current) setStatus("error");
        return false;
      }
    })();
    inflight.current = p;
    return p;
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

  // Flush a pending save when leaving (unmount or page hide) so edits are not lost.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      dirty.current = false;
      void saveRef.current(latest.current).catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const retry = useCallback(() => {
    clearTimeout(timer.current);
    void run();
  }, [run]);

  const flush = useCallback(async (): Promise<boolean> => {
    for (;;) {
      const p = inflight.current;
      if (p) await p;
      if (inflight.current !== p) continue; // a newer save started meanwhile: wait for that one
      if (!dirty.current && !failed.current) return true;
      clearTimeout(timer.current);
      return run();
    }
  }, [run]);

  return { status, retry, flush };
}
