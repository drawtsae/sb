"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const serverIds = useRef(new Map<string, string>(detail.cues.map((c) => [c.id, c.id])));
  const chains = useRef(new Map<string, Promise<void>>());
  const counter = useRef(0);

  const setStatus = useCallback((key: string, status: SaveStatus | null, retry?: () => void) => {
    setStatuses((prev) => {
      if (status === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      const cur = prev[key];
      if (cur && cur.status === status && cur.retry === retry) return prev;
      return { ...prev, [key]: { status, retry } };
    });
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

  /** Run a structural save, reflecting it in the indicator; failures offer a retry. */
  async function track(key: string, fn: () => Promise<void>): Promise<void> {
    setStatus(key, "saving");
    try {
      await fn();
      setStatus(key, null);
    } catch {
      setStatus(key, "error", () => void track(key, fn));
    }
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
    const p = prev
      .catch(() => undefined)
      .then(async () => {
        const sid = serverIds.current.get(key) ?? "";
        const r = await upsertCueAction(eventId, { ...cue, id: sid });
        if (!r.ok) {
          if (r.error === "invalid") setError(key, issueMessage(r.issues));
          throw new Error(r.error);
        }
        setError(key, null);
        setStatus(`op:cue:${key}`, null);
        serverIds.current.set(key, r.data.id);
        if (!sid) {
          const list = itemsRef.current;
          if (list.findIndex((i) => i.key === key) < list.length - 1) {
            await pushCueOrder().catch(() => undefined);
          }
        }
      });
    chains.current.set(key, p);
    return p;
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

  function retryAll() {
    for (const s of entries) if (s.status === "error") s.retry?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <Link href="/events" className="text-sm text-muted-foreground underline">
            ← Chương trình
          </Link>
          <h1 className="text-xl font-semibold">{detail.event.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <SaveIndicator status={overall} onRetry={retryAll} />
          <Link href={`/events/${eventId}/load`} className="text-sm underline">
            Kiểm tra &amp; nạp
          </Link>
        </div>
      </div>

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
      />
    </div>
  );
}
