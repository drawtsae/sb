import { z } from "zod";
import { settingsSchema } from "@/lib/validation";
import type { Cue, EventDetail, EventSettings } from "@/lib/types";

export interface EventExportV1 {
  version: 1;
  name: string;
  settings: EventSettings;
  songs: { ref: string; title: string; contentHash: string }[];
  background: string[]; // refs
  cues: (Omit<Cue, "id" | "songId"> & { songRef: string | null })[];
}

export const EXPORT_FORMAT_ERROR = "File không đúng định dạng";

const fade = z.number().min(0.1).max(30);

const cueExportSchema = z.object({
  position: z.number().int(),
  kind: z.enum(["song", "background"]),
  name: z.string(),
  songRef: z.string().nullable(),
  startSec: z.number().min(0),
  endSec: z.number().nullable(),
  fadeInSec: fade.nullable(),
  fadeOutSec: fade.nullable(),
  volume: z.number().int().min(0).max(100),
  onEnd: z.enum(["resume_background", "stop"]),
  note: z.string(),
});

const exportSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1),
    settings: settingsSchema,
    songs: z.array(z.object({ ref: z.string(), title: z.string(), contentHash: z.string() })),
    background: z.array(z.string()),
    cues: z.array(cueExportSchema),
  })
  .superRefine((d, ctx) => {
    const refs = new Set(d.songs.map((s) => s.ref));
    d.background.forEach((r, i) => {
      if (!refs.has(r)) ctx.addIssue({ code: "custom", path: ["background", i], message: "unknown ref" });
    });
    d.cues.forEach((c, i) => {
      if (c.songRef != null && !refs.has(c.songRef)) {
        ctx.addIssue({ code: "custom", path: ["cues", i, "songRef"], message: "unknown ref" });
      }
    });
  });

export function toExport(detail: EventDetail): EventExportV1 {
  const songs: EventExportV1["songs"] = [];
  const seen = new Set<string>();
  const use = (id: string) => {
    if (seen.has(id)) return;
    const s = detail.songs[id];
    if (!s) return;
    seen.add(id);
    songs.push({ ref: s.id, title: s.title, contentHash: s.contentHash });
  };
  detail.background.forEach((b) => use(b.songId));
  detail.cues.forEach((c) => c.songId && use(c.songId));
  return {
    version: 1,
    name: detail.event.name,
    settings: detail.event.settings,
    songs,
    background: detail.background.map((b) => b.songId).filter((id) => seen.has(id)),
    cues: detail.cues.map((c, i) => {
      const { id: _id, songId, ...rest } = c;
      void _id;
      return { ...rest, position: i, songRef: songId && seen.has(songId) ? songId : null };
    }),
  };
}

export function parseExport(json: unknown): EventExportV1 {
  let value = json;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error(EXPORT_FORMAT_ERROR);
    }
  }
  const r = exportSchema.safeParse(value);
  if (!r.success) throw new Error(EXPORT_FORMAT_ERROR);
  return r.data as EventExportV1;
}
