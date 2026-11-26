"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/time-format";
import type { Song } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";
import { SongPicker } from "./SongPicker";
import { SortableList } from "./Sortable";

export interface BgTrack {
  id: string;
  songId: string;
}

export function BackgroundList({
  tracks,
  songsById,
  allSongs,
  onAdd,
  onRemove,
  onReorder,
}: {
  tracks: BgTrack[];
  songsById: Record<string, Song>;
  allSongs: Song[];
  onAdd: (songId: string) => void;
  onRemove: (trackId: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<BgTrack | null>(null);

  return (
    <section
      aria-labelledby="bg-h"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <h2 id="bg-h" className="text-lg font-semibold text-foreground">
          Nhạc nền
        </h2>
        <Button type="button" size="sm" onClick={() => setPicking(true)}>
          Thêm bài
        </Button>
      </div>
      {tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có bài nhạc nền nào
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <SortableList
          id="bg-dnd"
          items={tracks}
          getKey={(t) => t.id}
          onReorder={onReorder}
        >
          {(t, { handle, index, count, move }) => {
            const song = songsById[t.songId];
            return (
              <div
                data-testid="bg-item"
                className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-2 py-1 text-sm"
              >
                {handle}
                <span className="w-6 text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {song?.title ?? "(bài đã mất)"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {song ? formatTime(song.durationSec) : ""}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Chuyển lên"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  <ChevronUp aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Chuyển xuống"
                  disabled={index === count - 1}
                  onClick={() => move(1)}
                >
                  <ChevronDown aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={() => setRemoving(t)}
                >
                  Xoá
                </Button>
              </div>
            );
          }}
        </SortableList>
      </div>
      {picking ? (
        <SongPicker
          songs={allSongs}
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false);
            onAdd(s.id);
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmModal
          title="Xoá bài này khỏi nhạc nền? Không thể hoàn tác."
          detail={songsById[removing.songId]?.title}
          onClose={() => setRemoving(null)}
          onConfirm={() => onRemove(removing.id)}
        />
      ) : null}
    </section>
  );
}
