"use client";

import { useEffect } from "react";
import type { EventSettings } from "@/lib/types";
import { NumberField } from "./NumberField";
import { useAutosave, type SaveStatus } from "./useAutosave";

export function SettingsPanel({
  settings,
  onChange,
  onSave,
  onStatus,
}: {
  settings: EventSettings;
  onChange: (patch: Partial<EventSettings>) => void;
  onSave: (s: EventSettings) => Promise<void>;
  onStatus: (key: string, status: SaveStatus | null, retry?: () => void) => void;
}) {
  const { status, retry } = useAutosave(settings, onSave);
  useEffect(() => {
    onStatus("settings", status, retry);
  }, [onStatus, status, retry]);
  useEffect(() => () => onStatus("settings", null), [onStatus]);

  const sec = (label: string, key: "cueFadeSec" | "bgCrossfadeSec" | "stopFadeSec") => (
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
    <section aria-labelledby="settings-h" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="settings-h" className="text-base font-semibold">
        Cài đặt
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sec("Chuyển tiết mục", "cueFadeSec")}
        {sec("Crossfade nhạc nền", "bgCrossfadeSec")}
        {sec("Fade out & dừng", "stopFadeSec")}
        {pct("Âm lượng nhạc nền", "bgVolume")}
        {pct("Âm lượng tổng", "masterVolume")}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.shuffle}
            onChange={(e) => onChange({ shuffle: e.target.checked })}
          />
          Trộn ngẫu nhiên
        </label>
      </div>
    </section>
  );
}
