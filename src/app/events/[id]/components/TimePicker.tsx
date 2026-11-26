"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTime, parseTime } from "@/lib/time-format";

let playing: HTMLAudioElement | null = null;

/**
 * A time field (m:ss, stored as seconds, 0.1 s steps) with a seek bar and a preview
 * from `<audio src="/api/songs/<id>/file">`.
 */
export function TimePicker({
  label,
  songId,
  durationSec,
  value,
  onChange,
  allowEmpty = false,
  emptyHint,
}: {
  label: string;
  songId: string | null;
  durationSec: number | null;
  value: number | null;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
  emptyHint?: string;
}) {
  const id = useId();
  const audio = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  function change(text: string) {
    setDraft(text);
    if (text.trim() === "") {
      if (allowEmpty) onChange(null);
      return;
    }
    const t = parseTime(text);
    if (t !== null) onChange(t);
  }

  function play() {
    const a = audio.current;
    if (!a) return;
    if (playing && playing !== a) playing.pause();
    playing = a;
    a.currentTime = value ?? 0;
    void a.play().catch(() => setIsPlaying(false));
  }

  function grab() {
    const a = audio.current;
    if (!a) return;
    onChange(Math.round(a.currentTime * 10) / 10);
  }

  const max = durationSec ?? 0;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={draft ?? (value === null ? "" : formatTime(value))}
        placeholder={emptyHint}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setDraft(null)}
        className="min-h-11 w-28 rounded-[10px] border border-border bg-surface-2 px-3 py-2 tabular-nums text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {songId ? (
        <>
          <input
            type="range"
            aria-label={`Thanh tua: ${label}`}
            min={0}
            max={max}
            step={0.1}
            value={Math.min(value ?? max, max)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="xs" variant="outline" onClick={play}>
              Nghe thử từ điểm này
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={grab}>
              Lấy vị trí đang nghe
            </Button>
            {isPlaying ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => audio.current?.pause()}
              >
                Dừng nghe thử
              </Button>
            ) : null}
          </div>
          <audio
            ref={audio}
            src={`/api/songs/${encodeURIComponent(songId)}/file`}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        </>
      ) : null}
    </div>
  );
}
