"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Cue, Song } from "@/lib/types";
import { NumberField } from "./NumberField";
import { SongPicker } from "./SongPicker";
import { TimePicker } from "./TimePicker";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { useState, type ReactNode } from "react";

const field = "rounded-md border bg-background px-2 py-1.5";

export function CueEditor({
  cueKey,
  cue,
  song,
  allSongs,
  error,
  handle,
  index,
  count,
  onChange,
  onSave,
  onStatus,
  onFlusher,
  onMove,
  onDuplicate,
  onDelete,
}: {
  cueKey: string;
  cue: Cue;
  song: Song | null;
  allSongs: Song[];
  error: string | null;
  handle: ReactNode;
  index: number;
  count: number;
  onChange: (patch: Partial<Cue>) => void;
  onSave: (cue: Cue) => Promise<void>;
  onStatus: (key: string, status: SaveStatus | null, retry?: () => void) => void;
  onFlusher: (key: string, flush: (() => Promise<boolean>) | null) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { status, retry, flush } = useAutosave(cue, onSave);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    onStatus(`cue:${cueKey}`, status, retry);
  }, [onStatus, cueKey, status, retry]);
  useEffect(() => () => onStatus(`cue:${cueKey}`, null), [onStatus, cueKey]);
  useEffect(() => {
    onFlusher(`cue:${cueKey}`, flush);
    return () => onFlusher(`cue:${cueKey}`, null);
  }, [onFlusher, cueKey, flush]);

  const isSong = cue.kind === "song";

  return (
    <div data-testid="cue-item" className="flex flex-col gap-3 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2">
        {handle}
        <span className="w-6 text-sm text-muted-foreground">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{cue.name || "(chưa đặt tên)"}</span>
        <Button type="button" size="xs" variant="ghost" aria-label="Chuyển lên" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="Chuyển xuống"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={onDuplicate}>
          Nhân bản
        </Button>
        <Button type="button" size="xs" variant="destructive" onClick={onDelete}>
          Xoá
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Loại
          <select
            value={cue.kind}
            onChange={(e) => {
              const kind = e.target.value as Cue["kind"];
              onChange(kind === "background" ? { kind, songId: null } : { kind });
            }}
            className={field}
          >
            <option value="song">Bài riêng</option>
            <option value="background">Nhạc nền</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tên tiết mục
          <input value={cue.name} onChange={(e) => onChange({ name: e.target.value })} className={field} />
        </label>

        {isSong ? (
          <>
            <div className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Bài hát</span>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => setPicking(true)}
              >
                {song ? song.title : "Chọn bài hát…"}
              </Button>
            </div>
            <TimePicker
              label="Giây bắt đầu"
              songId={cue.songId}
              durationSec={song?.durationSec ?? null}
              value={cue.startSec}
              onChange={(v) => onChange({ startSec: v ?? 0 })}
            />
            <TimePicker
              label="Giây kết thúc"
              songId={cue.songId}
              durationSec={song?.durationSec ?? null}
              value={cue.endSec}
              allowEmpty
              emptyHint="hết bài"
              onChange={(v) => onChange({ endSec: v })}
            />
            <NumberField
              label="Fade in"
              value={cue.fadeInSec}
              allowEmpty
              min={0.1}
              max={30}
              placeholder="theo cài đặt"
              suffix="giây"
              onCommit={(v) => onChange({ fadeInSec: v })}
            />
            <NumberField
              label="Fade out"
              value={cue.fadeOutSec}
              allowEmpty
              min={0.1}
              max={30}
              placeholder="theo cài đặt"
              suffix="giây"
              onCommit={(v) => onChange({ fadeOutSec: v })}
            />
            <NumberField
              label="Âm lượng"
              value={cue.volume}
              integer
              min={0}
              max={100}
              suffix="%"
              onCommit={(v) => onChange({ volume: v ?? 100 })}
            />
            <label className="flex flex-col gap-1 text-sm">
              Khi hết bài
              <select
                value={cue.onEnd}
                onChange={(e) => onChange({ onEnd: e.target.value as Cue["onEnd"] })}
                className={field}
              >
                <option value="resume_background">Phát tiếp nhạc nền</option>
                <option value="stop">Dừng</option>
              </select>
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Ghi chú
          <textarea
            rows={2}
            value={cue.note}
            onChange={(e) => onChange({ note: e.target.value })}
            className={field}
          />
        </label>
      </div>

      {picking ? (
        <SongPicker
          songs={allSongs}
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false);
            onChange({ songId: s.id, endSec: null, startSec: 0 });
          }}
        />
      ) : null}
    </div>
  );
}
