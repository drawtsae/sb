"use client";

import type { PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { bgPausedAt, bgSong, clock, type Sample } from "./live-view";

const pct = (v: number) => Math.round(v * 100);

/** Background panel (spec §6.6): playlist position, pause point, volumes. */
export function BackgroundPanel({
  snap, state, sample, disabled, onMaster,
}: { snap: ShowSnapshot; state: PlaybackState; sample: Sample; disabled: boolean; onMaster(to: number): void }) {
  const count = snap.background.length;
  const song = bgSong(state, snap);
  const next = bgSong(state, snap, 1);
  const pausedAt = bgPausedAt(state, snap, sample);
  let status: string;
  if (state.mode === "background") status = "(đang phát)";
  else if (pausedAt !== null) status = `(tạm dừng ở ${clock(pausedAt)})`;
  else if (state.bg.started) status = "(tạm dừng)";
  else status = "(chưa phát)";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-white/20 bg-white/5 p-3">
      <h2 className="text-lg font-bold tracking-wide text-white/70">
        NHẠC NỀN <span data-testid="bg-status" className="font-semibold text-white">{status}</span>
      </h2>
      {count === 0 ? (
        <p className="text-lg text-white/60">Chương trình không có nhạc nền</p>
      ) : (
        <div className="flex flex-col gap-1 text-xl">
          <p>
            ▸ Bài {state.bg.pos + 1}/{count}: {song ? `"${song.title}"` : "—"}
          </p>
          <p className="text-white/70">
            tiếp theo: {next ? `"${next.title}"` : snap.settings.shuffle ? "(trộn ngẫu nhiên)" : "—"}
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-lg">Âm lượng nền</span>
          <div
            role="meter"
            aria-label="Âm lượng nền"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct(snap.settings.bgVolume)}
            className="h-3 flex-1 overflow-hidden rounded-full bg-white/15"
          >
            <div className="h-full bg-white/50" style={{ width: `${pct(snap.settings.bgVolume)}%` }} />
          </div>
          <span className="w-14 text-right font-mono text-lg tabular-nums">{pct(snap.settings.bgVolume)}%</span>
        </div>
        <p className="-mt-2 text-sm text-white/50">Âm lượng nền chỉnh trong Cài đặt của chương trình.</p>
        <label className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-lg">Âm lượng tổng</span>
          <input
            type="range"
            aria-label="Âm lượng tổng"
            min={0}
            max={100}
            step={1}
            value={pct(state.master)}
            disabled={disabled}
            onChange={(e) => onMaster(Number(e.target.value) / 100)}
            className="h-3 flex-1 accent-emerald-400"
          />
          <span className="w-14 text-right font-mono text-lg tabular-nums">{pct(state.master)}%</span>
        </label>
      </div>
    </section>
  );
}
