"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";
import { clearLive } from "@/lib/offline/live-persist";
import { readSnapshot, saveSnapshot } from "@/lib/offline/snapshot";
import {
  loadShow, probeAudio, pruneMusicCache, withProbedDurations, type CueError, type LoadItem,
} from "@/lib/offline/music-cache";
import type { ShowSnapshot } from "@/lib/types";
import {
  MSG_EMPTY_BACKGROUND, backgroundTitles, emptyBackgroundWarning, startBlockReason, summaryRows,
} from "./load-view";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
// `next dev` runs without a service worker (see sw-register), so it cannot require one.
const devMode = process.env.NODE_ENV === "development";

/**
 * A full-document navigation, not router.push: Live then is its own document, so the browser's
 * Back (or closing the tab) mid-show goes through its beforeunload prompt instead of a
 * client-side route change that would silently end the show. Offline, the service worker serves
 * /live from the precache.
 */
// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full navigation, see above
const openLive = () => window.location.assign("/live");
const noSubscribe = () => () => {};

export function LoadClient({ eventId }: { eventId: string }) {
  const [snap, setSnap] = useState<ShowSnapshot | null>(null);
  const [items, setItems] = useState<LoadItem[]>([]);
  const [bytes, setBytes] = useState<[number, number]>([0, 0]);
  const [cueErrors, setCueErrors] = useState<CueError[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [ok, setOk] = useState(false);
  const [saved, setSaved] = useState(false);
  const [swControlled, setSwControlled] = useState(false);
  // Known only in the browser (null while server-rendering); it never changes for a page.
  const secure = useSyncExternalStore(noSubscribe, () => window.isSecureContext, () => null);
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
          // Live's machine must compute the same end as this browser's audio element will reach.
          const frozen = withProbedDurations(s, result.durations);
          saveSnapshot(frozen);
          setSnap(frozen);
          clearLive(s.eventId); // a live state saved with the previous snapshot no longer applies
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
  const blocked = startBlockReason(ok, secure, swControlled, devMode);
  const canStart = ok && blocked === null;

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

      {snap && emptyBackgroundWarning(snap) ? (
        <p role="status" data-testid="empty-bg-warning" className="text-sm text-amber-500">
          {MSG_EMPTY_BACKGROUND}
        </p>
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

      {ok && saved && snap ? (
        <section data-testid="load-summary" aria-labelledby="summary-h" className="flex flex-col gap-2 rounded-xl border p-3">
          <h2 id="summary-h" className="text-base font-semibold">
            Kịch bản đã nạp (Live sẽ phát đúng như sau)
          </h2>
          {snap.cues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có tiết mục nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pr-2 font-normal">#</th>
                    <th className="pr-2 font-normal">Tiết mục</th>
                    <th className="pr-2 font-normal">Loại</th>
                    <th className="pr-2 font-normal">Bài hát</th>
                    <th className="pr-2 font-normal">Bắt đầu</th>
                    <th className="pr-2 font-normal">Kết thúc</th>
                    <th className="font-normal">Khi hết bài</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows(snap).map((r) => (
                    <tr key={r.position} data-testid="summary-row" className="border-t">
                      <td className="pr-2">{r.position}</td>
                      <td className="pr-2">{r.name}</td>
                      <td className="pr-2">{r.kind}</td>
                      <td className="pr-2">{r.song}</td>
                      <td className="pr-2 tabular-nums">{r.start}</td>
                      <td className="pr-2 tabular-nums">{r.end}</td>
                      <td>{r.onEnd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p data-testid="summary-background" className="text-sm">
            <span className="text-muted-foreground">Nhạc nền: </span>
            {snap.background.length === 0
              ? "(trống)"
              : backgroundTitles(snap)
                  .map((t, i) => `${i + 1}. ${t}`)
                  .join(" · ")}
          </p>
        </section>
      ) : null}

      {blocked ? (
        <p role="alert" data-testid="start-blocked" className="text-sm text-destructive">
          {blocked}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canStart} onClick={openLive}>
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
            <li>Tắt Wi-Fi.</li>
            <li>Bấm nút &quot;Mở trang Live&quot;.</li>
            <li>Trên trang Live, tải lại (F5).</li>
            <li>Nếu trang hiện tên chương trình là đạt.</li>
          </ol>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOfflineHelp(false)}>
              Đóng
            </Button>
            <Button type="button" onClick={openLive}>
              Mở trang Live
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
