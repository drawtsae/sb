"use client";

import { useEffect } from "react";
import type { EventSettings, Transition } from "@/lib/types";
import { TRANSITION_LABEL } from "@/app/live/components/transition-label";
import { NumberField } from "./NumberField";
import { useAutosave, type SaveStatus } from "./useAutosave";

const selectClass =
  "min-h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SettingsPanel({
  settings,
  onChange,
  onSave,
  onStatus,
  onFlusher,
}: {
  settings: EventSettings;
  onChange: (patch: Partial<EventSettings>) => void;
  onSave: (s: EventSettings) => Promise<void>;
  onStatus: (
    key: string,
    status: SaveStatus | null,
    retry?: () => void,
  ) => void;
  onFlusher: (key: string, flush: (() => Promise<boolean>) | null) => void;
}) {
  const { status, retry, flush } = useAutosave(settings, onSave);
  useEffect(() => {
    onStatus("settings", status, retry);
  }, [onStatus, status, retry]);
  useEffect(() => () => onStatus("settings", null), [onStatus]);
  useEffect(() => {
    onFlusher("settings", flush);
    return () => onFlusher("settings", null);
  }, [onFlusher, flush]);

  const sec = (
    label: string,
    key: "cueFadeSec" | "bgCrossfadeSec" | "stopFadeSec",
  ) => (
    <NumberField
      label={label}
      value={settings[key]}
      min={0.1}
      max={30}
      suffix="giây"
      onCommit={(v) => v !== null && onChange({ [key]: v })}
    />
  );
  const pct = (label: string, key: "bgVolume" | "masterVolume") => (
    <NumberField
      label={label}
      value={Math.round(settings[key] * 100)}
      integer
      min={0}
      max={100}
      suffix="%"
      onCommit={(v) => v !== null && onChange({ [key]: v / 100 })}
    />
  );

  return (
    <section
      aria-labelledby="settings-h"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="settings-h" className="text-lg font-semibold text-foreground">
        Cài đặt
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sec("Chuyển tiết mục", "cueFadeSec")}
        {sec("Crossfade nhạc nền", "bgCrossfadeSec")}
        {sec("Fade out & dừng", "stopFadeSec")}
        {pct("Âm lượng nhạc nền", "bgVolume")}
        {pct("Âm lượng tổng", "masterVolume")}
        <label className="flex flex-col gap-1 text-sm">
          Kiểu chuyển mặc định
          <select
            value={settings.defaultTransition}
            onChange={(e) =>
              onChange({ defaultTransition: e.target.value as Transition })
            }
            className={selectClass}
          >
            {(Object.keys(TRANSITION_LABEL) as Transition[]).map((t) => (
              <option key={t} value={t}>
                {TRANSITION_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={settings.shuffle}
            onChange={(e) => onChange({ shuffle: e.target.checked })}
          />
          Trộn ngẫu nhiên
        </label>
      </div>
    </section>
  );
}
