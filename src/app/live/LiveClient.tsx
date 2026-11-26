"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { History, LogOut, Play, TriangleAlert, VolumeX } from "lucide-react";
import { OfflineStatus } from "@/components/offline-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Modal } from "@/app/library/components/Modal";
import { clearLive, readLive, restoreState, type LivePersisted } from "@/lib/offline/live-persist";
import { readSnapshot, SNAPSHOT_KEY } from "@/lib/offline/snapshot";
import { initialState, type PlaybackEvent, type PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { BackgroundPanel } from "./components/BackgroundPanel";
import { bigButton, ControlBar, MasterVolume, NextCue } from "./components/ControlBar";
import { CueColumn, CueNotes } from "./components/CueColumn";
import { NowPlaying } from "./components/NowPlaying";
import { createActionGuard } from "./components/action-guard";
import { nextCueIndex, type Sample } from "./components/live-view";
import { AUDIO_FAILED, EMPTY_INFO, MISSING_MUSIC, useLiveEngine } from "./components/useLiveEngine";
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
  // A state saved with another snapshot (rehearsal, then a re-load) is cleared, not offered.
  const [saved] = useState(() => readLive(snap.eventId, snap.takenAt));
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
    <main className="flex flex-1 flex-col items-center justify-center bg-background p-6 text-center text-foreground">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-muted-foreground">{snap.eventName}</h1>
        <div className="flex flex-col gap-2">
          <p className="flex items-center justify-center gap-3 text-3xl font-bold">
            <History aria-hidden="true" className="size-8 text-gold" />
            Có phiên Live đang dở
          </p>
          <p className="text-lg text-muted-foreground tabular-nums">
            Lưu lúc {stamp(saved.savedAt)}
            {cue ? ` · tiết mục: ${cue.name}` : ""} · đã phát {saved.playedCueIds.length} tiết mục
          </p>
          <p className="text-lg text-muted-foreground">Tiếp tục sẽ không tự phát nhạc.</p>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={onResume}
            className={cn(buttonVariants(), bigButton, "w-auto px-8 text-2xl")}
          >
            Tiếp tục từ chỗ cũ
          </button>
          <button
            type="button"
            onClick={onRestart}
            className={cn(buttonVariants({ variant: "outline" }), bigButton, "w-auto px-8 text-2xl font-semibold")}
          >
            Bắt đầu lại
          </button>
        </div>
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
  const decksRef = useRef<HTMLDivElement>(null);
  const {
    state, dispatch, getState, deckInfo, started, ready, error, start, audioSuspended, resumeAudio, clearSaved,
  } = useLiveEngine(snap, {
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

  // Off while the exit confirm is open: N/B/F there would act behind the dialog.
  useShortcuts({ next, background, fadeStop, volume: (d) => setMaster(getState().master + d) }, !confirmExit);
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
    // A deliberate exit is not a crash: no "Tiếp tục từ chỗ cũ" next time.
    clearSaved();
    // Full navigation, like "Bắt đầu tiệc" (beforeunload is skipped while exiting).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full navigation
    window.location.assign("/events");
  };

  const nextIndex = nextCueIndex(state, snap);
  return (
    <div className="flex flex-1 flex-col gap-4 bg-background p-3 text-foreground md:p-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-2 shadow-sm">
        <span className="inline-flex items-center gap-2 rounded-full bg-success px-3 py-1 text-sm font-bold tracking-widest text-background">
          <span aria-hidden="true" className="size-2 rounded-full bg-background" />
          LIVE
        </span>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="truncate text-xl font-semibold">{snap.eventName}</h1>
          <span className="text-sm text-muted-foreground tabular-nums">Nạp lúc {stamp(snap.takenAt)}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <MasterVolume value={state.master} disabled={controlsOff} onChange={setMaster} />
          <OfflineStatus />
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            disabled={exiting}
            className={cn(buttonVariants({ variant: "outline" }), "px-4")}
          >
            <LogOut aria-hidden="true" />
            Thoát
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4">
        {started && audioSuspended ? (
          <button
            type="button"
            onClick={resumeAudio}
            className={cn(
              buttonVariants(),
              bigButton,
              "border-2 border-gold bg-gold text-2xl text-gold-foreground hover:bg-gold/85 focus-visible:ring-gold/60",
            )}
          >
            <TriangleAlert aria-hidden="true" />
            Âm thanh bị tạm dừng bởi trình duyệt — bấm vào đây để bật lại
          </button>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <NowPlaying snap={snap} state={state} sample={sample} />
          <NextCue snap={snap} index={nextIndex} disabled={controlsOff} onNext={next} />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <CueColumn
            snap={snap}
            state={state}
            disabled={controlsOff}
            onGo={(i) => act(`cue:${i}`, { type: "GO_CUE", index: i })}
          />
          <div className="flex flex-col gap-4">
            <BackgroundPanel snap={snap} state={state} sample={sample} />
            <CueNotes snap={snap} state={state} />
          </div>
        </div>

        <ControlBar
          settings={snap.settings}
          mode={state.mode}
          hasBackground={snap.background.length > 0}
          disabled={controlsOff}
          onBackground={background}
          onFadeStop={fadeStop}
        />
      </main>

      {/* The driver's <audio data-deck> elements are attached here. */}
      <div ref={decksRef} hidden data-testid="audio-decks" />

      {!started ? <StartOverlay snap={snap} ready={ready} error={error} onStart={() => void start()} /> : null}

      {exiting ? (
        <div
          role="status"
          className="fixed inset-0 z-50 flex items-center justify-center gap-3 bg-background/90 text-3xl font-bold"
        >
          <VolumeX aria-hidden="true" className="size-8 text-muted-foreground" />
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
    </div>
  );
}

/** Browsers only allow audio after a user gesture: the operator's first click creates it. */
function StartOverlay({
  snap, ready, error, onStart,
}: { snap: ShowSnapshot; ready: boolean; error: string | null; onStart(): void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-background/95 p-6 text-center text-foreground">
      <p className="text-xl font-semibold text-muted-foreground">{snap.eventName}</p>
      {error ? (
        <div className="flex max-w-2xl flex-col items-center gap-5 rounded-2xl border-2 border-destructive bg-destructive-surface p-8">
          <p role="alert" className="flex items-center gap-3 text-3xl font-bold text-destructive">
            <TriangleAlert aria-hidden="true" className="size-9 shrink-0" />
            {error}
          </p>
          {error === AUDIO_FAILED ? (
            <button
              type="button"
              onClick={onStart}
              className={cn(buttonVariants(), bigButton, "w-auto px-8 text-2xl")}
            >
              Thử lại
            </button>
          ) : null}
          {error === MISSING_MUSIC ? (
            <Link
              href={`/events/${snap.eventId}/load`}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-xl text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Kiểm tra &amp; nạp
            </Link>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={!ready}
          onClick={onStart}
          className={cn(
            buttonVariants(),
            "h-auto min-h-32 gap-4 rounded-2xl px-10 text-4xl font-bold whitespace-normal shadow-sm [&_svg:not([class*='size-'])]:size-10",
          )}
        >
          <Play aria-hidden="true" className="fill-current" />
          {ready ? "Bấm để bắt đầu điều khiển" : "Đang chuẩn bị nhạc…"}
        </button>
      )}
    </div>
  );
}
