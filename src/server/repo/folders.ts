import { asc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { folders, songs } from "@/server/db/schema";
import type { Folder } from "@/lib/types";

export class FolderNotEmptyError extends Error {
  constructor() {
    super("folder not empty");
    this.name = "FolderNotEmptyError";
  }
}

export class FolderCycleError extends Error {
  constructor() {
    super("cannot move a folder into its own descendant");
    this.name = "FolderCycleError";
  }
}

const cleanName = (name: string) => {
  const n = name.normalize("NFC").trim();
  if (!n) throw new Error("name required");
  return n;
};

export function listFolders(db: Db): Folder[] {
  return db.select().from(folders).orderBy(asc(folders.name), asc(folders.id)).all();
}

export function createFolder(db: Db, name: string, parentId: string | null): Folder {
  return db.insert(folders).values({ name: cleanName(name), parentId }).returning().get();
}

export function renameFolder(db: Db, id: string, name: string): Folder {
  const row = db.update(folders).set({ name: cleanName(name) }).where(eq(folders.id, id)).returning().get();
  if (!row) throw new Error("folder not found");
  return row;
}

export function moveFolder(db: Db, id: string, parentId: string | null): Folder {
  // Walk up from the target parent; meeting `id` means the target is inside the folder.
  const seen = new Set<string>();
  for (let cur: string | null = parentId; cur !== null && !seen.has(cur); ) {
    if (cur === id) throw new FolderCycleError();
    seen.add(cur);
    cur = db.select({ p: folders.parentId }).from(folders).where(eq(folders.id, cur)).get()?.p ?? null;
  }
  const row = db.update(folders).set({ parentId }).where(eq(folders.id, id)).returning().get();
  if (!row) throw new Error("folder not found");
  return row;
}

export function deleteFolder(db: Db, id: string): void {
  const hasSong = db.select({ id: songs.id }).from(songs).where(eq(songs.folderId, id)).limit(1).get();
  const hasChild = db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, id)).limit(1).get();
  if (hasSong || hasChild) throw new FolderNotEmptyError();
  db.delete(folders).where(eq(folders.id, id)).run();
}
