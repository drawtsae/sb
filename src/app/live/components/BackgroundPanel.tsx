"use client";

import type { PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { bgPausedAt, bgSong, clock, type Sample } from "./live-view";

const pct = (v: number) => Math.round(v * 100);

/** NHẠC NỀN (spec §6.6): playlist position, pause point, read-only background volume. */
export function BackgroundPanel({ snap, state, sample }: { snap: ShowSnapshot; state: PlaybackState; sample: Sample }) {
  const count = snap.background.length;
  const song = bgSong(state, snap);
  const next = bgSong(state, snap, 1);
  const pausedAt = bgPausedAt(state, snap, sample);
  const playing = state.mode === "background";
  let status: string;
  if (playing) status = "đang phát";
  else if (pausedAt !== null) status = `tạm dừng ở ${clock(pausedAt)}`;
  else if (state.bg.started) status = "tạm dừng";
  else status = "chưa phát";

  return (
    <section
      aria-labelledby="bg-panel-h"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="bg-panel-h" className="text-sm font-bold tracking-widest text-muted-foreground">
          NHẠC NỀN
        </h2>
        <span
          data-testid="bg-status"
          className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums ${
            playing ? "border-success/50 text-success" : "border-border text-foreground"
          }`}
        >
          {status}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-lg text-muted-foreground">Chương trình không có nhạc nền</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground tabular-nums">
            Bài {state.bg.pos + 1}/{count}
          </p>
          <p className="truncate text-xl font-semibold">{song ? song.title : "—"}</p>
          <p className="truncate text-base text-muted-foreground">
            tiếp: {next ? next.title : snap.settings.shuffle ? "(trộn ngẫu nhiên)" : "—"}
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-base">Âm lượng nền</span>
          <div
            role="meter"
            aria-label="Âm lượng nền"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct(snap.settings.bgVolume)}
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${pct(snap.settings.bgVolume)}%` }} />
          </div>
          <span className="w-12 text-right text-base font-semibold tabular-nums">{pct(snap.settings.bgVolume)}%</span>
        </div>
        <p className="text-sm text-muted-foreground">
          <span>(chỉ xem)</span> Âm lượng nền chỉnh trong Cài đặt của chương trình.
        </p>
      </div>
    </section>
  );
}
