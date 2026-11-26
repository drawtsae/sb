"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TRANSITION_LABEL } from "@/app/live/components/transition-label";
import type { Cue, Song, Transition } from "@/lib/types";
import { NumberField } from "./NumberField";
import { SongPicker } from "./SongPicker";
import { TimePicker } from "./TimePicker";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { useState, type ReactNode } from "react";

const field =
  "min-h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const STATUS_TITLE: Record<SaveStatus, string> = {
  saved: "Đã lưu",
  saving: "Đang lưu…",
  error: "Lỗi lưu",
};

export function CueEditor({
  cueKey,
  cue,
  song,
  allSongs,
  error,
  handle,
  index,
  count,
  transitionText,
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
  transitionText: string;
  onChange: (patch: Partial<Cue>) => void;
  onSave: (cue: Cue) => Promise<void>;
  onStatus: (
    key: string,
    status: SaveStatus | null,
    retry?: () => void,
  ) => void;
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
    <div
      data-testid="cue-item"
      className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface-2 p-2 sm:p-3"
    >
      <div className="grid grid-cols-[2.75rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 md:grid-cols-[2.75rem_2rem_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_1.25rem_auto]">
        {handle}
        <span className="text-sm text-muted-foreground tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {cue.name || "(chưa đặt tên)"}
        </span>
        <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
          {cue.note}
        </span>
        <span className="hidden min-w-0 truncate text-sm text-muted-foreground tabular-nums md:block">
          {transitionText}
        </span>
        <span
          className="hidden justify-self-center md:block"
          title={STATUS_TITLE[status]}
        >
          {status === "saving" ? (
            <Loader2
              aria-hidden
              className="size-4 animate-spin text-muted-foreground"
            />
          ) : status === "error" ? (
            <AlertCircle aria-hidden className="size-4 text-destructive" />
          ) : (
            <Check aria-hidden className="size-4 text-success" />
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Chuyển lên"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Chuyển xuống"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onDuplicate}
          >
            Nhân bản
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            onClick={onDelete}
          >
            Xoá
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 px-1 pb-1 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Loại
          <select
            value={cue.kind}
            onChange={(e) => {
              const kind = e.target.value as Cue["kind"];
              onChange(
                kind === "background" ? { kind, songId: null } : { kind },
              );
            }}
            className={field}
          >
            <option value="song">Bài riêng</option>
            <option value="background">Nhạc nền</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tên tiết mục
          <input
            value={cue.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={field}
          />
        </label>

        {isSong ? (
          <>
            <div className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Bài hát</span>
              <Button
                type="button"
                variant="outline"
                className="justify-start border-border bg-surface-2"
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
              Kiểu chuyển
              <select
                value={cue.transition ?? ""}
                onChange={(e) =>
                  onChange({
                    transition:
                      e.target.value === ""
                        ? null
                        : (e.target.value as Transition),
                  })
                }
                className={field}
              >
                <option value="">Theo cài đặt chung</option>
                {(Object.keys(TRANSITION_LABEL) as Transition[]).map((t) => (
                  <option key={t} value={t}>
                    {TRANSITION_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Khi hết bài
              <select
                value={cue.onEnd}
                onChange={(e) =>
                  onChange({ onEnd: e.target.value as Cue["onEnd"] })
                }
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
