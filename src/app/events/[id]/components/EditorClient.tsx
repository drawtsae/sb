"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Cue, EventDetail, EventSettings, Song } from "@/lib/types";
import {
  addBackgroundTrackAction,
  deleteCueAction,
  removeBackgroundTrackAction,
  reorderBackgroundAction,
  reorderCuesAction,
  updateSettingsAction,
  upsertCueAction,
  type ActionResult,
} from "../../actions";
import { BackgroundList, type BgTrack } from "./BackgroundList";
import { CueList, type CueItem } from "./CueList";
import { SaveIndicator } from "./SaveIndicator";
import { SettingsPanel } from "./SettingsPanel";
import type { SaveStatus } from "./useAutosave";

const SONG_REQUIRED = "Tiết mục loại Bài riêng phải chọn bài hát";
const UNSAVED_LOAD = "Còn thay đổi chưa lưu được — hãy sửa lỗi trước khi nạp";
const UNSAVED_LEAVE = "Còn thay đổi chưa lưu được — hãy sửa lỗi trước khi rời trang";

function issueMessage(issues: { path: (string | number)[]; message: string }[] | undefined): string {
  const first = issues?.[0];
  switch (first?.path[0]) {
    case "songId":
      return SONG_REQUIRED;
    case "endSec":
      return "Giây kết thúc phải lớn hơn giây bắt đầu";
    case "fadeInSec":
    case "fadeOutSec":
      return "Fade phải từ 0,1 đến 30 giây";
    case "volume":
      return "Âm lượng phải từ 0 đến 100";
    default:
      return "Tiết mục chưa hợp lệ";
  }
}

function must<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return (r as { ok: true; data: T }).data;
}

type StatusMap = Record<string, { status: SaveStatus; retry?: () => void }>;

export function EditorClient({ detail, allSongs }: { detail: EventDetail; allSongs: Song[] }) {
  const eventId = detail.event.id;
  const router = useRouter();
  const [songs] = useState(() => {
    const m: Record<string, Song> = { ...detail.songs };
    for (const s of allSongs) m[s.id] = s;
    return m;
  });

  const [bg, setBg] = useState<BgTrack[]>(detail.background);
  const [items, setItems] = useState<CueItem[]>(() => detail.cues.map((c) => ({ key: c.id, cue: c })));
  const [settings, setSettings] = useState<EventSettings>(detail.event.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const serverIds = useRef(new Map<string, string>(detail.cues.map((c) => [c.id, c.id])));
  const chains = useRef(new Map<string, Promise<void>>());
  const counter = useRef(0);
  const deletedKeys = useRef(new Set<string>());
  /** Mirrors `statuses` synchronously, so leaving the page can check it right after awaiting. */
  const statusesRef = useRef<StatusMap>({});
  /** Structural saves (track) still running. */
  const ops = useRef(new Set<Promise<void>>());
  /** Autosave flushes of the cue editors and the settings panel, by status key. */
  const flushers = useRef(new Map<string, () => Promise<boolean>>());

  const setStatus = useCallback((key: string, status: SaveStatus | null, retry?: () => void) => {
    const prev = statusesRef.current;
    let next = prev;
    if (status === null) {
      if (key in prev) {
        next = { ...prev };
        delete next[key];
      }
    } else {
      const cur = prev[key];
      if (!cur || cur.status !== status || cur.retry !== retry) next = { ...prev, [key]: { status, retry } };
    }
    if (next === prev) return;
    statusesRef.current = next;
    setStatuses(next);
  }, []);

  const setFlusher = useCallback((key: string, flush: (() => Promise<boolean>) | null) => {
    if (flush) flushers.current.set(key, flush);
    else flushers.current.delete(key);
  }, []);

  function setError(key: string, message: string | null) {
    setErrors((prev) => {
      if ((prev[key] ?? null) === message) return prev;
      const next = { ...prev };
      if (message === null) delete next[key];
      else next[key] = message;
      return next;
    });
  }

  /** Run a structural save, reflecting it in the indicator; failures offer a retry. Never rejects. */
  function track(key: string, fn: () => Promise<void>): Promise<void> {
    const p = (async () => {
      setStatus(key, "saving");
      try {
        await fn();
        setStatus(key, null);
      } catch {
        setStatus(key, "error", () => void track(key, fn));
      }
    })();
    ops.current.add(p);
    void p.then(() => ops.current.delete(p));
    return p;
  }

  async function settled(): Promise<void> {
    await Promise.all([...chains.current.values()].map((p) => p.catch(() => undefined)));
  }

  /** Push the local order of saved cues to the server. */
  async function pushCueOrder(): Promise<void> {
    await settled();
    const ids = itemsRef.current
      .map((i) => serverIds.current.get(i.key))
      .filter((x): x is string => !!x);
    if (ids.length === 0) return;
    must(await reorderCuesAction(eventId, ids));
  }

  function saveCue(key: string, cue: Cue): Promise<void> {
    const prev = chains.current.get(key) ?? Promise.resolve();
    // The chain only covers the upsert. Pushing the order must happen after the chain
    // resolves (it waits on every chain, including this one).
    const p = prev
      .catch(() => undefined)
      .then(async (): Promise<boolean> => {
        if (deletedKeys.current.has(key)) return false;
        const sid = serverIds.current.get(key) ?? "";
        const r = await upsertCueAction(eventId, { ...cue, id: sid });
        if (!r.ok) {
          if (r.error === "invalid") setError(key, issueMessage(r.issues));
          throw new Error(r.error);
        }
        setError(key, null);
        setStatus(`op:cue:${key}`, null);
        serverIds.current.set(key, r.data.id);
        const list = itemsRef.current;
        return !sid && list.findIndex((i) => i.key === key) < list.length - 1;
      });
    chains.current.set(
      key,
      p.then(
        () => undefined,
        () => undefined,
      ),
    );
    // Tracked (not awaited inside the chain): a failure shows "Lỗi lưu, thử lại", and the retry
    // re-reads the current order.
    return p.then(async (needsOrder) => {
      if (needsOrder) await track("op:reorder:cues", pushCueOrder);
    });
  }

  function insertCue(cue: Cue, at: number) {
    const key = `new-${++counter.current}`;
    const item: CueItem = { key, cue: { ...cue, id: key } };
    setItems((prev) => [...prev.slice(0, at), item, ...prev.slice(at)]);
    itemsRef.current = [...itemsRef.current.slice(0, at), item, ...itemsRef.current.slice(at)];
    void track(`op:cue:${key}`, () => saveCue(key, item.cue));
  }

  const blank = (): Cue => ({
    id: "",
    position: 0,
    kind: "song",
    name: "",
    songId: null,
    startSec: 0,
    endSec: null,
    fadeInSec: null,
    fadeOutSec: null,
    volume: 100,
    onEnd: "resume_background",
    note: "",
  });

  function patchCue(key: string, patch: Partial<Cue>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, cue: { ...i.cue, ...patch } } : i)));
  }

  function duplicateCue(key: string) {
    const at = items.findIndex((i) => i.key === key);
    if (at < 0) return;
    const src = items[at].cue;
    insertCue({ ...src, name: src.name ? `${src.name} (bản sao)` : src.name }, at + 1);
  }

  function deleteCue(key: string) {
    deletedKeys.current.add(key);
    setItems((prev) => prev.filter((i) => i.key !== key));
    itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
    setError(key, null);
    setStatus(`op:cue:${key}`, null);
    const pending = chains.current.get(key) ?? Promise.resolve();
    void track(`op:del:${key}`, async () => {
      await pending.catch(() => undefined);
      const sid = serverIds.current.get(key);
      serverIds.current.delete(key);
      chains.current.delete(key);
      if (sid) must(await deleteCueAction(eventId, sid));
    });
  }

  function reorderCuesLocal(keys: string[]) {
    const byKey = new Map(itemsRef.current.map((i) => [i.key, i]));
    const next = keys.map((k) => byKey.get(k)).filter((i): i is CueItem => !!i);
    setItems(next);
    itemsRef.current = next;
    void track("op:reorder:cues", pushCueOrder);
  }

  function addTrack(songId: string) {
    void track(`op:add:${++counter.current}`, async () => {
      const t = must(await addBackgroundTrackAction(eventId, songId));
      setBg((prev) => [...prev, t]);
    });
  }

  function removeTrack(id: string) {
    setBg((prev) => prev.filter((t) => t.id !== id));
    void track(`op:rm:${id}`, async () => {
      must(await removeBackgroundTrackAction(eventId, id));
    });
  }

  function reorderTracks(ids: string[]) {
    const byId = new Map(bg.map((t) => [t.id, t]));
    setBg(ids.map((i) => byId.get(i)).filter((t): t is BgTrack => !!t));
    void track("op:reorder:bg", async () => {
      must(await reorderBackgroundAction(eventId, ids));
    });
  }

  const entries = Object.values(statuses);
  const overall: SaveStatus = entries.some((s) => s.status === "error")
    ? "error"
    : entries.some((s) => s.status === "saving")
      ? "saving"
      : "saved";

  const unsaved = overall !== "saved";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function retryAll() {
    for (const s of entries) if (s.status === "error") s.retry?.();
  }

  /**
   * Saves everything still pending (debounced cue and settings edits, structural saves) and waits
   * for it. True when the server has every change; false while any save is in error.
   */
  async function flushAll(): Promise<boolean> {
    // Let an edit committed by this same click (e.g. a field's blur) reach its autosave first.
    await new Promise((r) => setTimeout(r, 0));
    const results = await Promise.all([...flushers.current.values()].map((f) => f()));
    while (ops.current.size > 0) await Promise.all([...ops.current]);
    await settled();
    const opError = Object.entries(statusesRef.current).some(([k, s]) => k.startsWith("op:") && s.status === "error");
    return results.every(Boolean) && !opError;
  }

  async function leave(href: string, unsavedMessage: string) {
    if (leaving) return;
    setLeaving(true);
    setLeaveError(null);
    if (await flushAll()) {
      router.push(href);
      return;
    }
    setLeaving(false);
    setLeaveError(unsavedMessage);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            disabled={leaving}
            onClick={() => void leave("/events", UNSAVED_LEAVE)}
            className="text-sm text-muted-foreground underline"
          >
            ← Chương trình
          </button>
          <h1 className="text-xl font-semibold">{detail.event.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <SaveIndicator status={overall} onRetry={retryAll} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={leaving}
            onClick={() => void leave(`/events/${eventId}/load`, UNSAVED_LOAD)}
          >
            Kiểm tra &amp; nạp
          </Button>
        </div>
      </div>
      {leaveError && overall !== "saved" ? (
        <p role="alert" className="text-sm text-destructive">
          {leaveError}
        </p>
      ) : null}

      <BackgroundList
        tracks={bg}
        songsById={songs}
        allSongs={allSongs}
        onAdd={addTrack}
        onRemove={removeTrack}
        onReorder={reorderTracks}
      />

      <CueList
        items={items}
        songsById={songs}
        allSongs={allSongs}
        errors={errors}
        onAdd={() => insertCue(blank(), items.length)}
        onChange={patchCue}
        onSave={saveCue}
        onStatus={setStatus}
        onFlusher={setFlusher}
        onReorder={reorderCuesLocal}
        onDuplicate={duplicateCue}
        onDelete={deleteCue}
      />

      <SettingsPanel
        settings={settings}
        onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        onSave={async (s) => {
          must(await updateSettingsAction(eventId, s));
        }}
        onStatus={setStatus}
        onFlusher={setFlusher}
      />
    </div>
  );
}
