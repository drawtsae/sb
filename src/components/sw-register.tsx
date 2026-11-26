"use client";

import { useEffect } from "react";

// Not Serwist's <SerwistProvider>: its defaults reload the page when the network comes back
// (fatal mid-show on /live) and ask the SW to cache every visited URL.
const disable = process.env.NODE_ENV === "development";

/** Registers /sw.js on every page so the Load page gets a controller and /live works offline. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    const sw = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
    if (!sw) return;
    if (disable) {
      // `next dev` never uses the SW; drop one left over from a production run on this origin.
      void sw
        .getRegistrations()
        .then((rs) => Promise.all(rs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }
    void sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
