"use client";

import { useEffect } from "react";

type Sentinel = { release(): Promise<void> };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

/**
 * Keeps the screen on while `active` (spec §6.9). The browser drops the lock whenever the page is
 * hidden, so it is requested again each time the page becomes visible. Unsupported or refused
 * requests are ignored.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) return;
    let sentinel: Sentinel | null = null;
    let disposed = false;
    const request = () => {
      try {
        void api
          .request("screen")
          .then((s) => {
            if (disposed) void s.release().catch(() => {});
            else sentinel = s;
          })
          .catch(() => {});
      } catch {
        /* unsupported */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
