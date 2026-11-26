import type { cues } from "@/server/db/schema";
import type { Cue } from "@/lib/types";

export type CueRow = typeof cues.$inferSelect;

/** DB row -> domain Cue. A null fade means "use the event settings". */
export function rowToCue(row: CueRow): Cue {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind,
    name: row.name,
    songId: row.songId,
    startSec: row.startSec,
    endSec: row.endSec,
    fadeInSec: row.fadeInSec,
    fadeOutSec: row.fadeOutSec,
    volume: row.volume,
    onEnd: row.onEnd,
    note: row.note,
    transition: row.transition,
  };
}

/** Domain Cue -> DB row for the given event. */
export function cueToRow(eventId: string, cue: Cue): CueRow {
  return {
    id: cue.id,
    eventId,
    position: cue.position,
    kind: cue.kind,
    name: cue.name,
    songId: cue.songId,
    startSec: cue.startSec,
    endSec: cue.endSec,
    fadeInSec: cue.fadeInSec,
    fadeOutSec: cue.fadeOutSec,
    volume: cue.volume,
    onEnd: cue.onEnd,
    note: cue.note,
    transition: cue.transition,
  };
}
