import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { getEventDetail } from "@/server/repo/events";
import { listSongs } from "@/server/repo/songs";
import { EditorClient } from "./components/EditorClient";

export const dynamic = "force-dynamic";

export default async function EventEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/events/${id}`);
  const db = getDb();
  const detail = getEventDetail(db, id);
  if (!detail) notFound();
  const allSongs = listSongs(db);
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-5xl p-6">
        <EditorClient detail={detail} allSongs={allSongs} />
      </main>
    </>
  );
}
