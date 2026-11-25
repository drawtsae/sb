"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";
import { readSnapshot, saveSnapshot } from "@/lib/offline/snapshot";
import { loadShow, probeAudio, pruneMusicCache, type CueError, type LoadItem } from "@/lib/offline/music-cache";
import type { ShowSnapshot } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);

export function LoadClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [snap, setSnap] = useState<ShowSnapshot | null>(null);
  const [items, setItems] = useState<LoadItem[]>([]);
  const [bytes, setBytes] = useState<[number, number]>([0, 0]);
  const [cueErrors, setCueErrors] = useState<CueError[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [ok, setOk] = useState(false);
  const [saved, setSaved] = useState(false);
  const [swControlled, setSwControlled] = useState(false);
  const [stale, setStale] = useState<ShowSnapshot | null>(null);
  const [offlineHelp, setOfflineHelp] = useState(false);
  const [run, setRun] = useState(0);
  const persisted = useRef(false);

  useEffect(() => {
    if (persisted.current) return;
    persisted.current = true;
    try {
      void navigator.storage?.persist?.()?.catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const update = () => setSwControlled(Boolean(sw.controller));
    update();
    sw.addEventListener("controllerchange", update);
    return () => sw.removeEventListener("controllerchange", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRunning(true);
      setOk(false);
      setSaved(false);
      setFatal(null);
      setStale(null);
      setCueErrors([]);
      try {
        const res = await fetch(`/api/events/${eventId}/snapshot`, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? "Không tìm thấy chương trình" : "Không lấy được dữ liệu chương trình");
        const s = (await res.json()) as ShowSnapshot;
        if (cancelled) return;
        setSnap(s);
        const result = await loadShow(s, {
          caches,
          fetch: (...a) => fetch(...a),
          probe: probeAudio,
          onProgress: (i, done, total) => {
            if (cancelled) return;
            setItems(i);
            setBytes([done, total]);
          },
        });
        if (cancelled) return;
        setItems(result.items);
        setCueErrors(result.cueErrors);
        if (result.ok) {
          saveSnapshot(s);
          setSaved(true);
          await pruneMusicCache(Object.values(s.songs), caches).catch(() => 0);
        }
        setOk(result.ok);
        if (!result.ok) setStale(readSnapshot());
      } catch (e) {
        if (!cancelled) {
          setFatal(e instanceof Error ? e.message : "Có lỗi xảy ra");
          setStale(readSnapshot());
        }
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, run]);

  const reload = useCallback(() => setRun((n) => n + 1), []);
  const doneCount = items.filter((i) => i.status === "ok").length;
  const errorItems = items.filter((i) => i.status === "error");
  const cueName = (id: string) => snap?.cues.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <Link href={`/events/${eventId}`} className="text-sm text-muted-foreground underline">
            ← Quay lại chương trình
          </Link>
          <h1 className="text-xl font-semibold">Kiểm tra &amp; nạp{snap ? `: ${snap.eventName}` : ""}</h1>
        </div>
        {ok && saved && swControlled ? (
          <span data-testid="offline-badge" className="rounded-full bg-green-600/20 px-3 py-1 text-sm text-green-600">
            Sẵn sàng offline
          </span>
        ) : null}
      </div>

      {fatal ? (
        <p role="alert" className="text-sm text-destructive">
          {fatal}
        </p>
      ) : (
        <p data-testid="load-progress" className="text-sm">
          {doneCount}/{items.length} bài · {mb(bytes[0])}/{mb(bytes[1])} MB
          {running ? " · đang nạp…" : ""}
        </p>
      )}

      {stale && !ok && !running ? (
        <p role="status" data-testid="stale-warning" className="text-sm text-amber-500">
          Trang Live vẫn đang giữ bản nạp cũ ({stale.eventName} lúc {stamp(stale.takenAt)}). Hãy sửa lỗi rồi nạp lại.
        </p>
      ) : null}

      {errorItems.length > 0 || cueErrors.length > 0 ? (
        <ul data-testid="load-errors" className="flex flex-col gap-1 text-sm text-destructive">
          {errorItems.map((i) => (
            <li key={i.songId}>
              {i.title}: {i.reason}
            </li>
          ))}
          {cueErrors.map((e) => (
            <li key={e.cueId}>
              {cueName(e.cueId)}: {e.reason}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="flex flex-col gap-1 text-sm">
        {items.map((i) => (
          <li key={i.songId} className="flex justify-between gap-2 border-b py-1">
            <span className="truncate">{i.title}</span>
            <span className="text-muted-foreground">
              {{ pending: "Chờ", downloading: "Đang tải…", ok: "Đạt", error: "Lỗi" }[i.status]}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!ok} onClick={() => router.push("/live")}>
          Bắt đầu tiệc
        </Button>
        <Button type="button" variant="outline" disabled={!ok} onClick={() => setOfflineHelp(true)}>
          Thử chế độ offline
        </Button>
        <Button type="button" variant="ghost" disabled={running} onClick={reload}>
          Nạp lại
        </Button>
      </div>

      {offlineHelp ? (
        <Modal title="Thử chế độ offline" onClose={() => setOfflineHelp(false)}>
          <ol className="mb-3 list-decimal pl-5 text-sm">
            <li>Tắt Wi-Fi (hoặc rút mạng) trên máy này.</li>
            <li>Mở lại trang /live (tải lại trang).</li>
            <li>Nếu trang vẫn chạy và bài phát bình thường thì đã sẵn sàng.</li>
          </ol>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setOfflineHelp(false)}>
              Đóng
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
