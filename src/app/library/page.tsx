import { AppHeader } from "@/components/app-header";
import type { SP } from "@/lib/page-props";
import { requireUser } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { listFolders } from "@/server/repo/folders";
import { libraryUsage, listSongs } from "@/server/repo/songs";
import { FolderTree } from "./components/FolderTree";
import { SongTable } from "./components/SongTable";
import { UploadDropzone } from "./components/UploadDropzone";
import { UsageBar } from "./components/UsageBar";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LibraryPage({ searchParams }: SP) {
  const user = await requireUser("/library");
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const folderParam = first(sp.folder) || undefined;

  const db = getDb();
  const folders = listFolders(db);
  // folder: absent = all songs, "none" = no folder, otherwise a folder id (unknown ids show nothing).
  const folderId = folderParam === undefined ? undefined : folderParam === "none" ? null : folderParam;
  const songs = listSongs(db, { folderId, search: q });
  const usage = await libraryUsage(db);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">Kho nhạc</h1>
          <UsageBar musicBytes={usage.musicBytes} diskFreeBytes={usage.diskFreeBytes} />
        </div>
        <UploadDropzone folderId={typeof folderId === "string" ? folderId : null} />
        <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
          <FolderTree folders={folders} selected={folderId} q={q} />
          <SongTable songs={songs} folders={folders} q={q} folderParam={folderParam} />
        </div>
      </main>
    </>
  );
}
