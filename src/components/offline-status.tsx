"use client";

import { useEffect, useState } from "react";

/** Whether a service worker controls this page (so /live works offline). No network requests. */
export function OfflineStatus() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sw = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
    if (!sw) return;
    const update = () => setReady(Boolean(sw.controller));
    update();
    sw.addEventListener("controllerchange", update);
    return () => sw.removeEventListener("controllerchange", update);
  }, []);

  return (
    <p
      className={`flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-xs ${ready ? "text-foreground" : "text-muted-foreground"}`}
      role="status"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${ready ? "bg-success" : "bg-muted-foreground/50"}`}
      />
      {ready ? "Sẵn sàng offline" : "Chưa sẵn sàng offline"}
    </p>
  );
}
