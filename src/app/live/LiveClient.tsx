"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { readSnapshot, SNAPSHOT_KEY } from "@/lib/offline/snapshot";
import type { ShowSnapshot } from "@/lib/types";

// Live must not touch the server (spec 6.7): no fetch, and no prefetching <Link>.
// The snapshot comes from localStorage only, read after mount so SSR and hydration agree.

const subscribe = (onChange: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SNAPSHOT_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
};
const rawSnapshot = () => {
  try {
    return localStorage.getItem(SNAPSHOT_KEY);
  } catch {
    return null;
  }
};
/** undefined while prerendering/hydrating: nothing about the snapshot is known yet. */
const noSnapshotOnServer = () => undefined;

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

export function LiveClient() {
  const raw = useSyncExternalStore(subscribe, rawSnapshot, noSnapshotOnServer);
  const snap = useMemo(() => (raw === undefined ? undefined : readSnapshot()), [raw]);

  if (snap === undefined) return <main className="flex flex-1" aria-busy="true" />;
  if (snap === null) return <EmptyLive />;
  return <LiveShow snap={snap} />;
}

function EmptyLive() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg">Chưa nạp chương trình nào</p>
      <Link href="/events" prefetch={false} className="text-sm text-muted-foreground underline">
        Về danh sách chương trình
      </Link>
    </main>
  );
}

/** Placeholder show view; Task 14 replaces it with the Live controller. */
function LiveShow({ snap }: { snap: ShowSnapshot }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{snap.eventName}</h1>
        <span className="text-sm text-muted-foreground">Nạp lúc {stamp(snap.takenAt)}</span>
      </header>
      <ol data-testid="live-cues" className="flex flex-col gap-1">
        {snap.cues.map((c) => (
          <li key={c.id} className="rounded-md border px-3 py-2">
            {c.name}
          </li>
        ))}
      </ol>
    </main>
  );
}
