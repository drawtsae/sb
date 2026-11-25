"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";
import { formatTime } from "@/lib/time-format";
import type { Song } from "@/lib/types";

const norm = (s: string) => s.normalize("NFC").toLowerCase();

export function SongPicker({
  songs,
  onPick,
  onClose,
}: {
  songs: Song[];
  onPick: (song: Song) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const needle = norm(q.trim());
  const shown = needle
    ? songs.filter((s) => norm(`${s.title} ${s.artist ?? ""}`).includes(needle))
    : songs;
  return (
    <Modal title="Chọn bài hát" onClose={onClose}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm theo tên bài hoặc nghệ sĩ"
        aria-label="Tìm bài hát"
        className="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      />
      <div className="flex max-h-72 flex-col gap-1 overflow-auto">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có bài nào</p>
        ) : null}
        {shown.map((s) => (
          <Button
            key={s.id}
            type="button"
            variant="outline"
            className="h-auto justify-between gap-2 py-1.5"
            onClick={() => onPick(s)}
          >
            <span className="truncate text-left">
              {s.title}
              {s.artist ? <span className="text-muted-foreground"> · {s.artist}</span> : null}
            </span>
            <span className="text-xs text-muted-foreground">{formatTime(s.durationSec)}</span>
          </Button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
}
