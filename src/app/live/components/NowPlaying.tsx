"use client";

import type { ReactNode } from "react";
import { Music, VolumeX } from "lucide-react";
import type { PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { bgProgress, bgSong, clock, cueProgress, playingCue, type Progress, type Sample } from "./live-view";

function Bar({ p }: { p: Progress }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(p.fraction * 1000) / 10}%` }} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-xl font-semibold tabular-nums">
        <span>
          {clock(p.t)} / {clock(p.end)}
        </span>
        <span className="text-gold">còn {clock(p.remaining)}</span>
      </div>
    </div>
  );
}

/** The purple→gold music tile: the app has no cover art. */
function MusicTile() {
  return (
    <div
      aria-hidden="true"
      className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-gold text-primary-foreground shadow-sm md:size-24"
    >
      <Music className="size-10" />
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section
      data-testid="now-playing"
      aria-labelledby="now-playing-h"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 id="now-playing-h" className="text-sm font-bold tracking-widest text-muted-foreground">
        ĐANG PHÁT
      </h2>
      <div className="flex items-start gap-4">
        <MusicTile />
        <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
      </div>
    </section>
  );
}

/** "Tiết mục" / "Nhạc nền": what kind of thing is audible. */
function Kind({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>;
}

/** ĐANG PHÁT (spec §6.6): what is audible now, its progress, and what happens when it ends. */
export function NowPlaying({ snap, state, sample }: { snap: ShowSnapshot; state: PlaybackState; sample: Sample }) {
  if (state.mode === "silent") {
    return (
      <section
        data-testid="now-playing"
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-destructive bg-destructive-surface p-5 text-center"
      >
        <p role="status" className="flex items-center gap-3 text-5xl font-bold tracking-wide text-destructive">
          <VolumeX aria-hidden="true" className="size-12" />
          ĐANG IM LẶNG
        </p>
        <p className="text-lg text-foreground">
          Bấm &ldquo;Phát nhạc nền&rdquo; (B) hoặc &ldquo;Chuyển bài ngay&rdquo; (N) để phát lại.
        </p>
      </section>
    );
  }

  if (state.mode === "idle") {
    return (
      <Card>
        <p className="text-3xl font-bold">CHƯA PHÁT</p>
        <p className="text-lg text-muted-foreground">
          Bấm &ldquo;Phát nhạc nền&rdquo; (B) hoặc &ldquo;Chuyển bài ngay&rdquo; (N) để bắt đầu.
        </p>
      </Card>
    );
  }

  if (state.mode === "cue") {
    const p = playingCue(state, snap);
    const prog = cueProgress(state, snap, sample);
    const index = state.cue.cueIndex;
    return (
      <Card>
        <Kind>Tiết mục</Kind>
        {p ? (
          <>
            <p className="text-3xl font-bold leading-tight">
              {index !== null ? `${index + 1}. ` : ""}
              {p.cue.name}
            </p>
            <p className="truncate text-xl text-muted-foreground">{p.song.title}</p>
          </>
        ) : null}
        {prog ? <Bar p={prog} /> : null}
        {p ? (
          <p className="text-lg font-semibold text-gold">
            {p.cue.onEnd === "resume_background" ? "→ hết bài: phát tiếp nhạc nền" : "→ hết bài: dừng"}
          </p>
        ) : null}
      </Card>
    );
  }

  const song = bgSong(state, snap);
  const prog = bgProgress(state, snap, sample);
  return (
    <Card>
      <Kind>Nhạc nền</Kind>
      {song ? <p className="text-3xl font-bold leading-tight">{song.title}</p> : null}
      {prog ? <Bar p={prog} /> : null}
    </Card>
  );
}
