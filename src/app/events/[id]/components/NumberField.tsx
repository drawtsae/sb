"use client";

import { useId, useState } from "react";

/**
 * Text input for a number. Commits on every parseable in-range change (so autosave
 * sees it); the raw text is kept while focused and reverts to the value on blur.
 */
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  integer = false,
  allowEmpty = false,
  placeholder,
  suffix,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  min: number;
  max: number;
  integer?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  suffix?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  function change(text: string) {
    setDraft(text);
    const t = text.trim().replace(",", ".");
    if (t === "") {
      if (allowEmpty) onCommit(null);
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(t)) return;
    let n = Number(t);
    if (integer) n = Math.round(n);
    else n = Math.round(n * 10) / 10;
    if (n < min || n > max) return;
    onCommit(n);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          inputMode="decimal"
          value={draft ?? (value === null ? "" : String(value))}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          onBlur={() => setDraft(null)}
          className="w-24 rounded-md border bg-background px-2 py-1.5"
        />
        {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}
