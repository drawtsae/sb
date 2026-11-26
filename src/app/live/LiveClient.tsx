"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";
import { clearLive, readLive, restoreState, type LivePersisted } from "@/lib/offline/live-persist";
import { readSnapshot, SNAPSHOT_KEY } from "@/lib/offline/snapshot";
import { initialState, type PlaybackEvent, type PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { BackgroundPanel } from "./components/BackgroundPanel";
import { ControlBar } from "./components/ControlBar";
import { CueColumn } from "./components/CueColumn";
import { NowPlaying } from "./components/NowPlaying";
import { createActionGuard } from "./components/action-guard";
import { nextCueIndex, type Sample } from "./components/live-view";
import { EMPTY_INFO, MISSING_MUSIC, useLiveEngine } from "./components/useLiveEngine";
import { useShortcuts } from "./components/useShortcuts";
import { useWakeLock } from "./components/useWakeLock";

// Live must not touch the server (spec 6.7): no fetch, and no prefetching <Link>.
// The snapshot comes from localStorage only, read after mount so SSR and hydration agree.
// No lazy chunks either (next/dynamic, React.lazy, import()): a service-worker update during a
// show replaces the precache, and a chunk loaded later could then fail.

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
  // Once a show is up it stays up: another tab clearing or replacing the snapshot must not
  // unmount (and so stop) a running show. LiveShow freezes the first snapshot it gets.
  const [shown, setShown] = useState<ShowSnapshot | null>(null);
  if (snap && !shown) setShown(snap);

  if (shown) return <LiveShow snap={shown} />;
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

/** One show, frozen by LiveClient for the whole session. A saved live state offers a resume first. */
function LiveShow({ snap }: { snap: ShowSnapshot }) {
  const [saved] = useState(() => readLive(snap.eventId));
  const [initial, setInitial] = useState<PlaybackState | null>(() => (saved ? null : initialState(snap)));

  if (!initial) {
    if (!saved) return null; // unreachable: without a saved state `initial` is set
    return (
      <ResumePrompt
        snap={snap}
        saved={saved}
        onResume={() => setInitial(restoreState(snap, saved))}
        onRestart={() => {
          clearLive(snap.eventId);
          setInitial(initialState(snap));
        }}
      />
    );
  }
  return <LiveController snap={snap} initial={initial} />;
}

function ResumePrompt({
  snap, saved, onResume, onRestart,
}: { snap: ShowSnapshot; saved: LivePersisted; onResume(): void; onRestart(): void }) {
  const cue = saved.currentCueIndex !== null ? snap.cues[saved.currentCueIndex] : undefined;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-black p-6 text-center text-white">
      <h1 className="text-2xl font-semibold">{snap.eventName}</h1>
      <div className="flex max-w-xl flex-col gap-2">
        <p className="text-3xl font-bold">Có phiên Live đang dở</p>
        <p className="text-lg text-white/75">
          Lưu lúc {stamp(saved.savedAt)}
          {cue ? ` · tiết mục: ${cue.name}` : ""} · đã phát {saved.playedCueIds.length} tiết mục
        </p>
        <p className="text-lg text-white/75">Tiếp tục sẽ không tự phát nhạc.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={onResume}
          className="min-h-16 rounded-xl bg-emerald-500 px-8 text-2xl font-bold text-black hover:bg-emerald-400"
        >
          Tiếp tục từ chỗ cũ
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="min-h-16 rounded-xl border border-white/40 px-8 text-2xl font-semibold hover:bg-white/10"
        >
          Bắt đầu lại
        </button>
      </div>
    </main>
  );
}

const EMPTY_SAMPLE: Sample = { bg: EMPTY_INFO, cue: EMPTY_INFO };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Margin after the stop fade before leaving, so the fade has surely finished. */
const EXIT_MARGIN_MS = 300;
/** How often the progress display samples the decks. */
const SAMPLE_MS = 250;

/** The Live controller (spec §6.5, §6.6, §6.9). */
function LiveController({ snap, initial }: { snap: ShowSnapshot; initial: PlaybackState }) {
  const router = useRouter();
  const decksRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, getState, deckInfo, started, ready, error, start } = useLiveEngine(snap, {
    initial,
    container: decksRef,
  });
  const [pass] = useState(() => createActionGuard());
  const [sample, setSample] = useState<Sample>(EMPTY_SAMPLE);
  const [confirmExit, setConfirmExit] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const controlsOff = !started || exiting;

  /** A user action: dropped while leaving, and when it repeats the same control within 300 ms. */
  const act = useCallback(
    (key: string, ev: PlaybackEvent) => {
      if (exitingRef.current || !pass(key)) return;
      dispatch(ev);
    },
    [pass, dispatch],
  );
  const next = () => act("next", { type: "NEXT_CUE" });
  const background = () => {
    const mode = getState().mode;
    act("background", { type: mode === "idle" || mode === "silent" ? "START_BACKGROUND" : "BACK_TO_BACKGROUND" });
  };
  const fadeStop = () => act("stop", { type: "FADE_STOP" });
  const setMaster = (to: number) => {
    if (!exitingRef.current) dispatch({ type: "SET_MASTER", to: Math.round(to * 100) / 100 });
  };

  useShortcuts({ next, background, fadeStop, volume: (d) => setMaster(getState().master + d) });
  useWakeLock(started && !exiting);

  // Progress display: sampled from the driver, never fed back into the machine.
  useEffect(() => {
    if (!started) return;
    const tick = () => {
      const s = getState();
      setSample({ bg: deckInfo(s.bg.activeDeck), cue: deckInfo(s.cue.activeDeck) });
    };
    const id = setInterval(tick, SAMPLE_MS);
    return () => clearInterval(id);
  }, [started, getState, deckInfo]);

  // Closing or reloading the tab mid-show asks first.
  const idle = state.mode === "idle";
  useEffect(() => {
    if (idle) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (exitingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [idle]);

  /** Leave Live: fade everything out first (never cut), then go to the event list. */
  const exit = async () => {
    setConfirmExit(false);
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    const wasIdle = getState().mode === "idle";
    dispatch({ type: "FADE_STOP" });
    // Waits even from silent: a cue may still be on its own fade-out after ending into silence.
    if (!wasIdle) await sleep(snap.settings.stopFadeSec * 1000 + EXIT_MARGIN_MS);
    router.push("/events");
  };

  const nextIndex = nextCueIndex(state, snap);
  return (
    <main className="flex flex-1 flex-col gap-3 bg-black p-3 text-white md:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-semibold">{snap.eventName}</h1>
          <span className="text-sm text-white/60">Nạp lúc {stamp(snap.takenAt)}</span>
        </div>
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          disabled={exiting}
          className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          Thoát chế độ Live
        </button>
      </header>

      <NowPlaying snap={snap} state={state} sample={sample} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        <CueColumn
          snap={snap}
          state={state}
          disabled={controlsOff}
          onGo={(i) => act(`cue:${i}`, { type: "GO_CUE", index: i })}
        />
        <BackgroundPanel snap={snap} state={state} sample={sample} disabled={controlsOff} onMaster={setMaster} />
      </div>

      <ControlBar
        nextCue={nextIndex !== null ? snap.cues[nextIndex] : null}
        mode={state.mode}
        hasBackground={snap.background.length > 0}
        disabled={controlsOff}
        onNext={next}
        onBackground={background}
        onFadeStop={fadeStop}
      />

      {/* The driver's <audio data-deck> elements are attached here. */}
      <div ref={decksRef} hidden data-testid="audio-decks" />

      {!started ? <StartOverlay snap={snap} ready={ready} error={error} onStart={() => void start()} /> : null}

      {exiting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-3xl font-bold">
          Đang fade out…
        </div>
      ) : null}

      {confirmExit ? (
        <Modal title="Thoát chế độ Live?" onClose={() => setConfirmExit(false)}>
          <p className="mb-4 text-sm">Nhạc đang phát sẽ fade out rồi dừng, sau đó chuyển về danh sách chương trình.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmExit(false)}>
              Ở lại
            </Button>
            <Button type="button" variant="destructive" onClick={() => void exit()}>
              Thoát
            </Button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

/** Browsers only allow audio after a user gesture: the operator's first click creates it. */
function StartOverlay({
  snap, ready, error, onStart,
}: { snap: ShowSnapshot; ready: boolean; error: string | null; onStart(): void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center text-white">
      {error ? (
        <>
          <p role="alert" className="max-w-xl text-3xl font-bold text-red-300">
            {error}
          </p>
          {error === MISSING_MUSIC ? (
            <Link
              href={`/events/${snap.eventId}/load`}
              prefetch={false}
              className="text-xl text-white underline underline-offset-4"
            >
              Kiểm tra &amp; nạp
            </Link>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          disabled={!ready}
          onClick={onStart}
          className="min-h-32 rounded-2xl bg-emerald-500 px-10 text-4xl font-black text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          {ready ? "Bấm để bắt đầu điều khiển" : "Đang chuẩn bị nhạc…"}
        </button>
      )}
    </div>
  );
}
