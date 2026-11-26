"use client";

import { useEffect, useId, useRef } from "react";
import { Check, Lightbulb, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { PlaybackState } from "@/lib/playback/machine";
import type { ShowSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { clickThen } from "./ControlBar";
import { nextCueIndex } from "./live-view";
import { transitionLabel } from "./transition-label";

const num = (i: number) => String(i + 1).padStart(2, "0");

/**
 * KỊCH BẢN (spec §6.6): ✓ played, ▶ current, how each cue comes in, a Dừng badge for cues that
 * end in silence. "Chọn" jumps to a cue; the audibly playing one reads "Đang phát" instead.
 */
export function CueColumn({
  snap, state, disabled, onGo,
}: { snap: ShowSnapshot; state: PlaybackState; disabled: boolean; onGo(index: number): void }) {
  const current = state.currentCueIndex;
  const listRef = useRef<HTMLTableSectionElement>(null);
  const ids = useId();

  useEffect(() => {
    if (current === null) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  return (
    <section
      aria-labelledby={`${ids}-h`}
      className="flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 id={`${ids}-h`} className="text-sm font-bold tracking-widest text-muted-foreground">
        KỊCH BẢN
      </h2>
      {snap.cues.length === 0 ? <p className="text-lg text-muted-foreground">Chưa có tiết mục nào</p> : null}
      <div className="max-h-[45vh] min-h-0 overflow-y-auto">
        <table className="w-full border-separate border-spacing-y-1 text-left text-lg">
          <thead className="sr-only">
            <tr>
              <th scope="col">Trạng thái</th>
              <th scope="col">Số</th>
              <th scope="col">Tiết mục</th>
              <th scope="col">Kiểu chuyển</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody ref={listRef}>
            {snap.cues.map((c, i) => {
              const isCurrent = i === current;
              const played = state.playedCueIds.includes(c.id);
              // Choosing the cue that is audibly playing would restart it from its start: not offered.
              const audible = state.mode === "cue" && state.cue.cueIndex === i && !state.cue.ending;
              const nameId = `${ids}-name-${i}`;
              return (
                <tr
                  key={c.id}
                  data-testid="cue-row"
                  data-index={i}
                  data-played={played ? "true" : undefined}
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "transition-colors duration-150 [&>td]:py-1.5 [&>td:first-child]:rounded-l-[10px] [&>td:first-child]:pl-3 [&>td:last-child]:rounded-r-[10px] [&>td:last-child]:pr-2",
                    isCurrent ? "bg-surface-2 font-semibold [&>td:first-child]:shadow-[inset_4px_0_0_var(--primary)]" : "",
                    played && !isCurrent ? "text-muted-foreground" : "",
                  )}
                >
                  <td className="w-8">
                    {isCurrent ? (
                      <>
                        <Play aria-hidden="true" className="size-5 fill-gold text-gold" />
                        <span className="sr-only">Tiết mục hiện tại</span>
                      </>
                    ) : played ? (
                      <>
                        <Check aria-hidden="true" className="size-5 text-success" />
                        <span className="sr-only">Đã phát</span>
                      </>
                    ) : null}
                  </td>
                  <td className="w-10 tabular-nums text-muted-foreground">{num(i)}</td>
                  <td id={nameId} className="pr-2">
                    <span>{c.name}</span>
                    {c.kind === "song" && c.onEnd === "stop" ? (
                      <span
                        title="Hết bài: dừng"
                        className="ml-2 inline-block rounded-full border border-destructive/60 bg-destructive-surface px-2 text-sm font-semibold text-destructive"
                      >
                        Dừng
                      </span>
                    ) : null}
                  </td>
                  <td className="pr-2 text-base whitespace-nowrap text-muted-foreground">
                    {transitionLabel(snap.cues, i, snap.settings)}
                  </td>
                  <td className="w-28 text-right">
                    {audible ? (
                      <span className="inline-flex min-h-11 items-center rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground">
                        Đang phát
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-describedby={nameId}
                        disabled={disabled}
                        onClick={clickThen(() => onGo(i))}
                        className={cn(buttonVariants({ variant: "outline" }), "px-4 text-base")}
                      >
                        Chọn
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Gợi ý: the notes of the current cue and of the one N would start. */
export function CueNotes({ snap, state }: { snap: ShowSnapshot; state: PlaybackState }) {
  const current = state.currentCueIndex;
  const next = nextCueIndex(state, snap);
  const currentNote = current !== null ? snap.cues[current]?.note.trim() : "";
  const nextNote = next !== null ? snap.cues[next]?.note.trim() : "";
  return (
    <section aria-labelledby="cue-notes-h" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 id="cue-notes-h" className="flex items-center gap-2 text-sm font-bold tracking-widest text-muted-foreground">
        <Lightbulb aria-hidden="true" className="size-4 text-gold" />
        Gợi ý
      </h2>
      {!currentNote && !nextNote ? <p className="text-base text-muted-foreground">Không có ghi chú</p> : null}
      {currentNote ? (
        <div className="rounded-[10px] bg-surface-2 px-3 py-2">
          <p className="text-sm text-muted-foreground">Tiết mục hiện tại</p>
          <p className="text-lg">{currentNote}</p>
        </div>
      ) : null}
      {nextNote ? (
        <div className="rounded-[10px] border border-border px-3 py-2">
          <p className="text-sm text-muted-foreground">Tiết mục tiếp theo</p>
          <p className="text-lg">{nextNote}</p>
        </div>
      ) : null}
    </section>
  );
}
