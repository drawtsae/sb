"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import type { Cue, EventSettings } from "@/lib/types";
import {
  addBackgroundTrack,
  createEvent,
  deleteCue,
  deleteEvent,
  duplicateEvent,
  removeBackgroundTrack,
  renameEvent,
  reorderBackground,
  reorderCues,
  updateSettings,
  upsertCue,
  ValidationError,
  type ValidationIssue,
} from "@/server/repo/events";

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string; issues?: ValidationIssue[] };

async function run<T = undefined>(
  fn: () => T | Promise<T>,
  paths: string[] = ["/events"],
): Promise<ActionResult<T>> {
  await requireUser();
  let data: T;
  try {
    data = await fn();
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: "invalid", issues: e.issues };
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
  for (const p of paths) revalidatePath(p);
  return (data === undefined ? { ok: true } : { ok: true, data }) as ActionResult<T>;
}

const editor = (id: string) => ["/events", `/events/${id}`];

export async function createEventAction(name: string) {
  return run(() => createEvent(getDb(), name));
}

export async function renameEventAction(id: string, name: string) {
  return run(() => renameEvent(getDb(), id, name), editor(id));
}

export async function deleteEventAction(id: string) {
  return run(() => deleteEvent(getDb(), id));
}

export async function duplicateEventAction(id: string, newName: string) {
  return run(() => duplicateEvent(getDb(), id, newName));
}

export async function updateSettingsAction(id: string, settings: EventSettings) {
  return run(() => updateSettings(getDb(), id, settings), editor(id));
}

export async function addBackgroundTrackAction(eventId: string, songId: string) {
  return run(() => addBackgroundTrack(getDb(), eventId, songId), editor(eventId));
}

export async function removeBackgroundTrackAction(eventId: string, trackId: string) {
  return run(() => removeBackgroundTrack(getDb(), trackId, eventId), editor(eventId));
}

export async function reorderBackgroundAction(eventId: string, ids: string[]) {
  return run(() => reorderBackground(getDb(), eventId, ids), editor(eventId));
}

export async function upsertCueAction(eventId: string, cue: Cue) {
  return run(() => upsertCue(getDb(), eventId, cue), editor(eventId));
}

export async function deleteCueAction(eventId: string, cueId: string) {
  return run(() => deleteCue(getDb(), cueId, eventId), editor(eventId));
}

export async function reorderCuesAction(eventId: string, ids: string[]) {
  return run(() => reorderCues(getDb(), eventId, ids), editor(eventId));
}
