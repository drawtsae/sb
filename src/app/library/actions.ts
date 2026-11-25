"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import {
  createFolder,
  deleteFolder,
  FolderCycleError,
  FolderNotEmptyError,
  moveFolder,
  renameFolder,
} from "@/server/repo/folders";
import { deleteSong, SongInUseError, updateSong, type SongUsage } from "@/server/repo/songs";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; usage?: SongUsage[] };

async function run(fn: () => void | Promise<void>): Promise<ActionResult> {
  await requireUser();
  try {
    await fn();
  } catch (e) {
    if (e instanceof SongInUseError) return { ok: false, error: "in_use", usage: e.usage };
    if (e instanceof FolderNotEmptyError) return { ok: false, error: "folder_not_empty" };
    if (e instanceof FolderCycleError) return { ok: false, error: "folder_cycle" };
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/library");
  return { ok: true };
}

export async function updateSongAction(
  id: string,
  patch: { title?: string; artist?: string; folderId?: string | null },
): Promise<ActionResult> {
  return run(() => {
    updateSong(getDb(), id, patch);
  });
}

export async function deleteSongAction(id: string): Promise<ActionResult> {
  return run(() => deleteSong(getDb(), id));
}

export async function createFolderAction(name: string, parentId: string | null): Promise<ActionResult> {
  return run(() => {
    createFolder(getDb(), name, parentId);
  });
}

export async function renameFolderAction(id: string, name: string): Promise<ActionResult> {
  return run(() => {
    renameFolder(getDb(), id, name);
  });
}

export async function moveFolderAction(id: string, parentId: string | null): Promise<ActionResult> {
  return run(() => {
    moveFolder(getDb(), id, parentId);
  });
}

export async function deleteFolderAction(id: string): Promise<ActionResult> {
  return run(() => deleteFolder(getDb(), id));
}
