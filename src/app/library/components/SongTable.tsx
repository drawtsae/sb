"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Folder, Song } from "@/lib/types";
import { SongActions } from "./SongActions";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function SongTable({
  songs,
  folders,
  q,
  folderParam,
}: {
  songs: Song[];
  folders: Folder[];
  q: string;
  folderParam: string | undefined;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (folderParam) p.set("folder", folderParam);
      if (search.trim()) p.set("q", search.trim());
      const s = p.toString();
      router.replace(s ? `/library?${s}` : "/library");
    }, 250);
    return () => clearTimeout(t);
  }, [search, folderParam, router]);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên bài hoặc nghệ sĩ"
        className="w-full max-w-md rounded-md border bg-background px-3 py-1.5 text-sm"
      />
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-medium">Tên bài</th>
            <th className="py-1 pr-2 font-medium">Nghệ sĩ</th>
            <th className="py-1 pr-2 font-medium">Thời lượng</th>
            <th className="py-1 pr-2 font-medium">Thư mục</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {songs.map((s) => (
            <SongRow
              key={s.id}
              song={s}
              folders={folders}
              folderName={folderName(s.folderId)}
              previewing={previewId === s.id}
              onPreview={() => setPreviewId(previewId === s.id ? null : s.id)}
            />
          ))}
          {songs.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                Chưa có bài nào
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function SongRow({
  song,
  folders,
  folderName,
  previewing,
  onPreview,
}: {
  song: Song;
  folders: Folder[];
  folderName: string;
  previewing: boolean;
  onPreview: () => void;
}) {
  return (
    <tr data-testid="song-row" className="border-t align-top">
      <td className="py-2 pr-2">
        {song.title}
        {previewing ? (
          <audio
            controls
            autoPlay
            className="mt-2 w-full max-w-sm"
            src={`/api/songs/${song.id}/file`}
          />
        ) : null}
      </td>
      <td className="py-2 pr-2">{song.artist ?? ""}</td>
      <td className="py-2 pr-2 tabular-nums">{mmss(song.durationSec)}</td>
      <td className="py-2 pr-2">{folderName}</td>
      <td className="py-2">
        <SongActions song={song} folders={folders} onPreview={onPreview} />
      </td>
    </tr>
  );
}
