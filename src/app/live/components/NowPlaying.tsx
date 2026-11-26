"use client";

import type { PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { bgProgress, bgSong, clock, cueProgress, playingCue, type Progress, type Sample } from "./live-view";

function Bar({ p }: { p: Progress }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="h-3 min-w-40 flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className="h-full bg-emerald-400" style={{ width: `${Math.round(p.fraction * 1000) / 10}%` }} />
      </div>
      <span className="font-mono text-2xl tabular-nums">
        {clock(p.t)} / {clock(p.end)}
      </span>
      <span className="font-mono text-2xl tabular-nums text-amber-300">còn {clock(p.remaining)}</span>
    </div>
  );
}

/** Top strip (spec §6.6): what is audible now, its progress, and what happens when it ends. */
export function NowPlaying({ snap, state, sample }: { snap: ShowSnapshot; state: PlaybackState; sample: Sample }) {
  if (state.mode === "silent") {
    return (
      <section data-testid="now-playing" className="rounded-xl border-2 border-red-500 bg-red-950 p-4 text-center">
        <p role="status" className="text-5xl font-black tracking-wide text-red-300">
          ĐANG IM LẶNG
        </p>
        <p className="mt-2 text-lg text-white/80">Bấm &ldquo;Phát nhạc nền&rdquo; hoặc &ldquo;Tiết mục tiếp&rdquo; để phát lại.</p>
      </section>
    );
  }

  if (state.mode === "idle") {
    return (
      <section data-testid="now-playing" className="rounded-xl border border-white/20 bg-white/5 p-4">
        <p className="text-3xl font-bold">CHƯA PHÁT</p>
        <p className="mt-1 text-lg text-white/70">Bấm &ldquo;Phát nhạc nền&rdquo; hoặc &ldquo;Tiết mục tiếp&rdquo; để bắt đầu.</p>
      </section>
    );
  }

  if (state.mode === "cue") {
    const p = playingCue(state, snap);
    const prog = cueProgress(state, snap, sample);
    return (
      <section data-testid="now-playing" className="flex flex-col gap-2 rounded-xl border border-sky-400/60 bg-sky-950/60 p-4">
        <p className="text-3xl font-bold leading-tight">
          <span className="text-white/60">ĐANG PHÁT: </span>
          <span className="text-sky-300">[Tiết mục]</span> {p?.cue.name ?? ""}
          {p ? <span className="font-normal text-white/80"> — {`"${p.song.title}"`}</span> : null}
        </p>
        {prog ? <Bar p={prog} /> : null}
        {p ? (
          <p className="text-2xl font-semibold text-amber-200">
            {p.cue.onEnd === "resume_background" ? "→ hết bài: phát tiếp nhạc nền" : "→ hết bài: dừng"}
          </p>
        ) : null}
      </section>
    );
  }

  const song = bgSong(state, snap);
  const prog = bgProgress(state, snap, sample);
  return (
    <section data-testid="now-playing" className="flex flex-col gap-2 rounded-xl border border-emerald-400/60 bg-emerald-950/50 p-4">
      <p className="text-3xl font-bold leading-tight">
        <span className="text-white/60">ĐANG PHÁT: </span>
        <span className="text-emerald-300">[Nhạc nền]</span>
        {song ? <span className="font-normal text-white/80"> {`"${song.title}"`}</span> : null}
      </p>
      {prog ? <Bar p={prog} /> : null}
    </section>
  );
}
