import { z } from "zod";
import { DEFAULT_SETTINGS, type EventSettings } from "./types";

const fade = z.number().min(0.1).max(30);

export const cueSchema = z
  .object({
    id: z.string(),
    position: z.number().int(),
    kind: z.enum(["song", "background"]),
    name: z.string(),
    songId: z.string().nullable(),
    startSec: z.number().min(0),
    endSec: z.number().nullable(),
    fadeInSec: fade.nullable(),
    fadeOutSec: fade.nullable(),
    volume: z.number().int().min(0).max(100),
    onEnd: z.enum(["resume_background", "stop"]),
    note: z.string(),
  })
  .superRefine((c, ctx) => {
    if (c.kind === "song" && c.songId == null) {
      ctx.addIssue({ code: "custom", path: ["songId"], message: "songId required for song cues" });
    }
    if (c.endSec != null && c.endSec <= c.startSec) {
      ctx.addIssue({ code: "custom", path: ["endSec"], message: "endSec must be greater than startSec" });
    }
  });

export const settingsSchema = z.object({
  cueFadeSec: fade,
  bgCrossfadeSec: fade,
  stopFadeSec: fade,
  bgVolume: z.number().min(0).max(1),
  masterVolume: z.number().min(0).max(1),
  shuffle: z.boolean(),
});

/** Accepts an object or JSON string; invalid values fall back per key to defaults. */
export function parseSettings(raw: unknown): EventSettings {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS };
  }
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof EventSettings)[]) {
    if (!(key in input)) continue;
    const r = settingsSchema.shape[key].safeParse(input[key]);
    if (r.success) out[key] = r.data;
  }
  return out as unknown as EventSettings;
}
