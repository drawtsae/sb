"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Folder, Song } from "@/lib/types";
import { deleteSongAction, updateSongAction } from "../actions";
import { Modal } from "./Modal";
import { uploadErrorText } from "./upload-errors";

type Dlg = "edit" | "move" | "delete" | null;

export function SongActions({
  song,
  folders,
  onPreview,
}: {
  song: Song;
  folders: Folder[];
  onPreview: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const close = () => {
    setDlg(null);
    setError(null);
    setBlocked(null);
  };

  async function save(patch: { title?: string; artist?: string; folderId?: string | null }) {
    setBusy(true);
    const r = await updateSongAction(song.id, patch);
    setBusy(false);
    if (r.ok) close();
    else setError(r.error === "title required" ? "Vui lòng nhập tên bài" : "Có lỗi xảy ra");
  }

  async function remove() {
    setBusy(true);
    const r = await deleteSongAction(song.id);
    setBusy(false);
    if (r.ok) close();
    else if (r.error === "in_use") setBlocked((r.usage ?? []).map((u) => u.eventName));
    else setError("Có lỗi xảy ra");
  }

  async function replace(file: File) {
    setNote("Đang thay file…");
    try {
      const res = await fetch(
        `/api/songs/${encodeURIComponent(song.id)}/file?name=${encodeURIComponent(file.name)}`,
        { method: "PUT", body: file },
      );
      if (res.ok) {
        setNote(null);
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        setNote(uploadErrorText(body?.reason));
      }
    } catch {
      setNote(uploadErrorText("network"));
    }
  }

  const rootBtn = (label: string, folderId: string | null) => (
    <Button
      key={folderId ?? "root"}
      variant={song.folderId === folderId ? "secondary" : "outline"}
      className="justify-start"
      disabled={busy}
      onClick={() => void save({ folderId })}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      <Button size="xs" variant="ghost" onClick={onPreview}>
        Nghe thử
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          setTitle(song.title);
          setArtist(song.artist ?? "");
          setDlg("edit");
        }}
      >
        Sửa
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setDlg("move")}>
        Chuyển thư mục
      </Button>
      <Button size="xs" variant="ghost" onClick={() => fileInput.current?.click()}>
        Thay file
      </Button>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".mp3,.m4a,.aac,.wav"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void replace(f);
        }}
      />
      <Button size="xs" variant="destructive" onClick={() => setDlg("delete")}>
        Xoá
      </Button>

      {dlg === "edit" ? (
        <Modal title="Sửa thông tin bài" onClose={close}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ title, artist });
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              Tên bài
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Nghệ sĩ
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="h-11 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Huỷ
              </Button>
              <Button type="submit" disabled={busy}>
                Lưu
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dlg === "move" ? (
        <Modal title="Chuyển thư mục" onClose={close}>
          <div className="flex max-h-72 flex-col gap-1 overflow-auto">
            {rootBtn("Chưa phân loại", null)}
            {folders.map((f) => rootBtn(f.name, f.id))}
          </div>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
          </div>
        </Modal>
      ) : null}

      {dlg === "delete" ? (
        <Modal title={blocked ? "Không thể xoá vì bài đang được dùng" : "Xoá bài này? Không thể hoàn tác."} onClose={close}>
          {blocked ? (
            <ul className="mb-3 list-disc pl-5 text-sm">
              {blocked.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm">“{song.title}”</p>
          )}
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              {blocked ? "Đóng" : "Huỷ"}
            </Button>
            {blocked ? null : (
              <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
                Xoá
              </Button>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
