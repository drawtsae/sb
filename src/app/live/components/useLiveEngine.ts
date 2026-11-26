"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createAudioDriver, type AudioDriver, type AudioDriverOptions } from "@/lib/playback/audio-driver";
import { initialState, reduce, type Deck, type PlaybackEvent, type PlaybackState } from "@/lib/playback/machine";
import { getCachedBlob } from "@/lib/offline/music-cache";
import { captureLive, clearLive, readLive, saveLive, type LivePersisted } from "@/lib/offline/live-persist";
import type { ShowSnapshot } from "@/lib/types";

export const MISSING_MUSIC = "Thiếu nhạc trong bộ nhớ — quay lại Kiểm tra & nạp";
export const AUDIO_FAILED = "Không khởi động được âm thanh trên trình duyệt này";
/** Live state is saved this often, and on every cue or mode change. */
export const SAVE_EVERY_MS = 5000;
/** start() does not wait longer than this for AudioContext.resume(); the driver retries on play. */
const RESUME_WAIT_MS = 1000;
/** Margin after the unmount fade-out before the driver is disposed. */
const UNMOUNT_MARGIN_MS = 300;
/** A context the browser suspended/interrupted mid-show is resumed every 1 s, 10 times, then every 5 s. */
const RESUME_RETRY_FAST_MS = 1000;
const RESUME_RETRY_FAST_TRIES = 10;
const RESUME_RETRY_SLOW_MS = 5000;

/** ctx.resume() called synchronously (keeps a click's user activation); failures are ignored. */
function safeResume(ctx: AudioContext) {
  try {
    void ctx.resume().catch(() => {});
  } catch {
    /* closed or unsupported */
  }
}

export type DeckInfo =ReturnType<AudioDriver["deckInfo"]>;
export const EMPTY_INFO: DeckInfo = { songId: null, t: 0, duration: 0, paused: true };

/** Injectable for tests; the defaults are the browser's. */
export interface EngineDeps {
  caches: () => CacheStorage | undefined;
  createContext: () => AudioContext;
  createDriver: (ctx: AudioContext, resolveUrl: (songId: string) => string, opts: AudioDriverOptions) => AudioDriver;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  rng: () => number;
}

const defaultDeps: EngineDeps = {
  caches: () => (typeof caches === "undefined" ? undefined : caches),
  createContext: () => new AudioContext({ latencyHint: "playback" }),
  createDriver: createAudioDriver,
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
  rng: Math.random,
};

export interface LiveEngine {
  state: PlaybackState;
  /** Runs an event through the machine and its commands through the driver. No-op before start. */
  dispatch(ev: PlaybackEvent): void;
  /** Latest state, for handlers that may run before the next render. */
  getState(): PlaybackState;
  deckInfo: AudioDriver["deckInfo"];
  /** Every snapshot song has a cached object URL. */
  ready: boolean;
  error: string | null;
  started: boolean;
  /** Call from a click (autoplay policy): creates the AudioContext and the driver. Also the retry. */
  start(): Promise<void>;
  /** The running context was suspended or interrupted by the browser/OS: audio is not reaching the speakers. */
  audioSuspended: boolean;
  /** Resume the context; call from a click so the user gesture counts. */
  resumeAudio(): void;
  /** Deliberate exit: forget the saved live state and stop saving it (no resume prompt next time). */
  clearSaved(): void;
}

export interface LiveEngineOptions {
  /** Starting machine state (a restored one); default `initialState(snap)`. */
  initial?: PlaybackState;
  /** Where the <audio data-deck> elements are attached; default document.body. */
  container?: RefObject<HTMLElement | null>;
  deps?: Partial<EngineDeps>;
}

/**
 * Wires the pure machine (state, commands) to the Web Audio driver and the cached music.
 * Machine events come only from the driver (`onEvent`) and from `dispatch` (user actions).
 */
export function useLiveEngine(snap: ShowSnapshot, opts: LiveEngineOptions = {}): LiveEngine {
  const [deps] = useState<EngineDeps>(() => ({ ...defaultDeps, ...opts.deps }));
  const [state, setState] = useState<PlaybackState>(() => opts.initial ?? initialState(snap, deps.rng));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [audioSuspended, setAudioSuspended] = useState(false);

  const stateRef = useRef(state);
  const urlsRef = useRef<Map<string, string> | null>(null);
  const driverRef = useRef<AudioDriver | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const elementsRef = useRef<HTMLAudioElement[]>([]);
  const startingRef = useRef(false);
  const unmountedRef = useRef(false);
  const lastSavedRef = useRef<LivePersisted | null>(null);
  /** Set by clearSaved(): nothing is saved any more. */
  const sessionEndedRef = useRef(false);
  /** Object URLs whose release waits for the unmount fade-out. */
  const heldUrlsRef = useRef<string[]>([]);
  const container = opts.container;

  // Object URLs for every song, from the music cache only (Live never touches the server).
  useEffect(() => {
    let cancelled = false;
    const held = heldUrlsRef.current; // never reassigned
    const made: string[] = [];
    const urls = new Map<string, string>();
    void (async () => {
      const store = deps.caches();
      let missing = !store;
      for (const song of store ? Object.values(snap.songs) : []) {
        let blob: Blob | null = null;
        try {
          blob = await getCachedBlob(song, store!);
        } catch {
          blob = null;
        }
        if (cancelled) return;
        if (!blob) {
          missing = true;
          break;
        }
        const url = deps.createObjectURL(blob);
        made.push(url);
        urls.set(song.id, url);
      }
      if (cancelled) return;
      if (missing) {
        for (const u of made.splice(0)) deps.revokeObjectURL(u);
        setError(MISSING_MUSIC);
        return;
      }
      urlsRef.current = urls;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (urlsRef.current === urls) urlsRef.current = null;
      // Once a driver uses them, the unmount teardown revokes them after its fade-out.
      if (driverRef.current) held.push(...made.splice(0));
      for (const u of made.splice(0)) deps.revokeObjectURL(u);
    };
  }, [snap, deps]);

  const dispatch = useCallback(
    (ev: PlaybackEvent) => {
      const driver = driverRef.current;
      if (!driver) return;
      const out = reduce(stateRef.current, ev, snap, deps.rng);
      stateRef.current = out.state;
      if (out.commands.length > 0) {
        try {
          driver.run(out.commands);
        } catch (e) {
          console.error("[live] driver.run failed", e);
        }
      }
      // Not out.state: a driver event dispatched synchronously inside run() may have moved on.
      setState(stateRef.current);
    },
    [snap, deps],
  );

  const getState = useCallback(() => stateRef.current, []);

  const deckInfo = useCallback((deck: Deck) => driverRef.current?.deckInfo(deck) ?? EMPTY_INFO, []);

  const persist = useCallback(() => {
    const driver = driverRef.current;
    const s = stateRef.current;
    if (!driver || s.mode === "idle" || sessionEndedRef.current) return; // idle: nothing to resume
    const prev = lastSavedRef.current ?? readLive(snap.eventId, snap.takenAt);
    const p = captureLive(s, snap, driver.deckInfo(s.bg.activeDeck), prev);
    lastSavedRef.current = p;
    saveLive(snap.eventId, p);
  }, [snap]);

  const clearSaved = useCallback(() => {
    sessionEndedRef.current = true;
    clearLive(snap.eventId);
  }, [snap]);

  const resumeAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") safeResume(ctx); // synchronously, inside the click
  }, []);

  const start = useCallback(async () => {
    const urls = urlsRef.current;
    if (!ready || !urls || startingRef.current || driverRef.current) return;
    startingRef.current = true;
    setError((e) => (e === AUDIO_FAILED ? null : e)); // "Thử lại"
    let ctx: AudioContext;
    try {
      ctx = deps.createContext(); // synchronously inside the click: autoplay policy
    } catch (e) {
      console.error("[live] AudioContext failed", e);
      startingRef.current = false;
      setError(AUDIO_FAILED);
      return;
    }
    ctxRef.current = ctx;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.resolve()
        .then(() => ctx.resume())
        .catch(() => {}),
      new Promise<void>((r) => {
        timer = setTimeout(r, RESUME_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    if (unmountedRef.current) return; // the unmount cleanup closes the context
    const createElement = (deck: Deck) => {
      const el = document.createElement("audio");
      el.preload = "auto";
      el.dataset.deck = deck;
      (container?.current ?? document.body).appendChild(el);
      elementsRef.current.push(el);
      return el;
    };
    const driver = deps.createDriver(ctx, (songId) => urls.get(songId) ?? "", { createElement });
    driverRef.current = driver;
    unsubRef.current = driver.onEvent(dispatch);
    // The driver's master gain starts at 1: bring it to the state's master straight away.
    driver.run([{ type: "master", to: stateRef.current.master }]);
    setStarted(true);
  }, [ready, deps, dispatch, container]);

  // Save on every cue / mode change once running.
  useEffect(() => {
    if (started) persist();
  }, [started, state.currentCueIndex, state.playedCueIds, state.mode, persist]);

  // Save every 5 s and when the page is hidden or unloaded; wake a suspended context on return.
  useEffect(() => {
    if (!started) return;
    const id = setInterval(persist, SAVE_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        persist();
        return;
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {});
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [started, persist]);

  // Keep the context running: the browser/OS can suspend or interrupt it mid-show (audio device
  // change, another app taking audio, power saving). Resume at once, then every 1 s (10 times),
  // then every 5 s, and flag it so the page shows a click-to-resume banner meanwhile.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!started || !ctx) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const healthy = () => ctx.state === "running" || ctx.state === "closed";
    const check = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const ok = healthy();
      setAudioSuspended(!ok);
      if (ok) {
        tries = 0;
        return;
      }
      tries += 1;
      safeResume(ctx);
      timer = setTimeout(check, tries < RESUME_RETRY_FAST_TRIES ? RESUME_RETRY_FAST_MS : RESUME_RETRY_SLOW_MS);
    };
    ctx.addEventListener("statechange", check);
    const first = setTimeout(check, 0); // the state may already have changed since start
    return () => {
      ctx.removeEventListener("statechange", check);
      clearTimeout(first);
      if (timer !== null) clearTimeout(timer);
    };
  }, [started]);

  // Unmount (exit, or a client-side Back that beforeunload cannot catch): last save, then run the
  // "Fade out & dừng" ramps and only later release the driver, the context, the elements and the
  // URLs. Note: React removes the deck container with the page, and an <audio> element removed
  // from the document is paused by the browser (HTML spec), so this fade is best-effort only;
  // the deliberate exit fades out *before* leaving the page.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);
  useEffect(() => {
    unmountedRef.current = false;
    const elements = elementsRef.current; // never reassigned
    const held = heldUrlsRef.current; // never reassigned
    return () => {
      unmountedRef.current = true;
      persistRef.current();
      unsubRef.current?.();
      unsubRef.current = null;
      const driver = driverRef.current;
      const finish = () => {
        driver?.dispose();
        driverRef.current = null;
        const ctx = ctxRef.current;
        ctxRef.current = null;
        if (ctx) {
          try {
            void ctx.close().catch(() => {});
          } catch {
            /* already closed */
          }
        }
        for (const el of elements.splice(0)) {
          el.removeAttribute("src");
          el.remove();
        }
        for (const u of held.splice(0)) deps.revokeObjectURL(u);
        startingRef.current = false;
      };
      const s = stateRef.current;
      if (!driver || s.mode === "idle") {
        finish();
        return;
      }
      const out = reduce(s, { type: "FADE_STOP" }, snap, deps.rng);
      stateRef.current = out.state;
      try {
        driver.run(out.commands);
      } catch {
        /* disposing anyway */
      }
      // Disposal waits for the fade length (elements still in the document keep fading).
      setTimeout(finish, snap.settings.stopFadeSec * 1000 + UNMOUNT_MARGIN_MS);
    };
  }, [snap, deps]);

  return {
    state, dispatch, getState, deckInfo, ready, error, started, start, audioSuspended, resumeAudio, clearSaved,
  };
}
