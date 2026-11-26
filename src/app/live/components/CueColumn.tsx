"use client";

import { useEffect, useRef } from "react";
import type { PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { clickThen } from "./ControlBar";
import { nextCueIndex } from "./live-view";

/** The script (spec §6.6): ✓ played, ▶ current, [Dừng] for cues that end in silence. Click to jump. */
export function CueColumn({
  snap, state, disabled, onGo,
}: { snap: ShowSnapshot; state: PlaybackState; disabled: boolean; onGo(index: number): void }) {
  const current = state.currentCueIndex;
  const next = nextCueIndex(state, snap);
  const currentNote = current !== null ? snap.cues[current]?.note.trim() : "";
  const nextNote = next !== null ? snap.cues[next]?.note.trim() : "";
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (current === null) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  return (
    <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/20 bg-white/5 p-3">
      <h2 className="text-lg font-bold tracking-wide text-white/70">KỊCH BẢN</h2>
      {snap.cues.length === 0 ? <p className="text-lg text-white/60">Chưa có tiết mục nào</p> : null}
      <ol ref={listRef} className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
        {snap.cues.map((c, i) => {
          const isCurrent = i === current;
          const played = state.playedCueIds.includes(c.id);
          // Clicking the cue that is audibly playing would restart it from its start: ignore it.
          const audible = state.mode === "cue" && state.cue.cueIndex === i && !state.cue.ending;
          return (
            <li key={c.id}>
              <button
                type="button"
                data-testid="cue-row"
                data-index={i}
                data-played={played ? "true" : undefined}
                aria-current={isCurrent ? "true" : undefined}
                title={audible ? "Đang phát" : undefined}
                disabled={disabled}
                onClick={clickThen(() => {
                  if (!audible) onGo(i);
                })}
                className={`flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-xl ${
                  isCurrent ? "bg-sky-500/30 font-bold ring-2 ring-sky-400" : "hover:bg-white/10"
                } ${audible ? "cursor-default" : ""} ${played && !isCurrent ? "text-white/60" : ""}`}
              >
                <span className="w-6 shrink-0 text-center" aria-hidden="true">
                  {isCurrent ? "▶" : played ? "✓" : ""}
                </span>
                <span className="sr-only">{isCurrent ? "Đang phát: " : played ? "Đã phát: " : ""}</span>
                <span className="flex-1">
                  {i + 1}. {c.name}
                  {c.kind === "background" ? <span className="text-white/60"> (nhạc nền)</span> : null}
                </span>
                {c.kind === "song" && c.onEnd === "stop" ? (
                  <span className="shrink-0 rounded border border-red-400 px-1.5 text-base font-semibold text-red-300">
                    [Dừng]
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      {currentNote ? (
        <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-lg text-amber-100">
          <span className="font-semibold">Ghi chú: </span>
          {currentNote}
        </p>
      ) : null}
      {nextNote ? (
        <p className="rounded-lg bg-white/10 px-3 py-2 text-lg text-white/85">
          <span className="font-semibold">Ghi chú tiết mục tiếp: </span>
          {nextNote}
        </p>
      ) : null}
    </section>
  );
}
