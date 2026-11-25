import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { songs } from "@/server/db/schema";
import { parseSettings } from "@/lib/validation";
import type { EventRecord } from "@/lib/types";
import type { EventExportV1 } from "@/lib/events/export";
import { addBackgroundTrack, createEvent, getEventDetail, updateSettings, upsertCue } from "./events";

export const MISSING_SUFFIX = " (thiếu bài)";

/** Creates a new event from an export; songs are matched by content hash. One transaction. */
export function importEvent(
  db: Db,
  data: EventExportV1,
): { event: EventRecord; missing: { title: string; contentHash: string }[] } {
  return db.transaction((tx) => {
    const t = tx as unknown as Db; // nested repo transactions become savepoints
    const byRef = new Map<string, { id: string | null; title: string; contentHash: string }>();
    for (const s of data.songs) {
      const row = t.select({ id: songs.id }).from(songs).where(eq(songs.contentHash, s.contentHash)).limit(1).get();
      byRef.set(s.ref, { id: row?.id ?? null, title: s.title, contentHash: s.contentHash });
    }

    const ev = createEvent(t, data.name);
    updateSettings(t, ev.id, parseSettings(data.settings));

    for (const ref of data.background) {
      const id = byRef.get(ref)?.id;
      if (id) addBackgroundTrack(t, ev.id, id);
    }

    const sorted = [...data.cues].sort((a, b) => a.position - b.position);
    for (const c of sorted) {
      const { songRef, ...rest } = c;
      const id = songRef ? (byRef.get(songRef)?.id ?? null) : null;
      const lost = c.kind === "song" && !id;
      upsertCue(t, ev.id, {
        ...rest,
        id: crypto.randomUUID(),
        songId: id,
        kind: lost ? "background" : c.kind,
        name: lost ? c.name + MISSING_SUFFIX : c.name,
      });
    }

    const missing = [...byRef.values()]
      .filter((s) => !s.id)
      .map(({ title, contentHash }) => ({ title, contentHash }));
    return { event: getEventDetail(t, ev.id)!.event, missing };
  });
}
