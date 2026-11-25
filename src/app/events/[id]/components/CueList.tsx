"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Cue, Song } from "@/lib/types";
import { ConfirmModal } from "./ConfirmModal";
import { CueEditor } from "./CueEditor";
import { SortableList } from "./Sortable";
import type { SaveStatus } from "./useAutosave";

export interface CueItem {
  /** Stable local key: the server id for loaded cues, `new-N` for cues not yet saved. */
  key: string;
  cue: Cue;
}

export function CueList({
  items,
  songsById,
  allSongs,
  errors,
  onAdd,
  onChange,
  onSave,
  onStatus,
  onReorder,
  onDuplicate,
  onDelete,
}: {
  items: CueItem[];
  songsById: Record<string, Song>;
  allSongs: Song[];
  errors: Record<string, string>;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<Cue>) => void;
  onSave: (key: string, cue: Cue) => Promise<void>;
  onStatus: (key: string, status: SaveStatus | null, retry?: () => void) => void;
  onReorder: (keys: string[]) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  const [deleting, setDeleting] = useState<CueItem | null>(null);

  return (
    <section aria-labelledby="cues-h" className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h2 id="cues-h" className="text-base font-semibold">
          Kịch bản
        </h2>
        <Button type="button" size="sm" onClick={onAdd}>
          Thêm tiết mục
        </Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có tiết mục nào</p> : null}
      <div className="flex flex-col gap-2">
        <SortableList id="cue-dnd" items={items} getKey={(i) => i.key} onReorder={onReorder}>
          {(item, { handle, index, count, move }) => (
            <CueEditor
              cueKey={item.key}
              cue={item.cue}
              song={item.cue.songId ? (songsById[item.cue.songId] ?? null) : null}
              allSongs={allSongs}
              error={errors[item.key] ?? null}
              handle={handle}
              index={index}
              count={count}
              onChange={(patch) => onChange(item.key, patch)}
              onSave={(c) => onSave(item.key, c)}
              onStatus={onStatus}
              onMove={move}
              onDuplicate={() => onDuplicate(item.key)}
              onDelete={() => setDeleting(item)}
            />
          )}
        </SortableList>
      </div>
      {deleting ? (
        <ConfirmModal
          title="Xoá tiết mục này? Không thể hoàn tác."
          detail={deleting.cue.name || undefined}
          onClose={() => setDeleting(null)}
          onConfirm={() => onDelete(deleting.key)}
        />
      ) : null}
    </section>
  );
}
