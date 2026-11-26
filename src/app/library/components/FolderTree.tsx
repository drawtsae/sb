"use client";

import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Folder } from "@/lib/types";
import { createFolderAction, deleteFolderAction, renameFolderAction } from "../actions";
import { Modal } from "./Modal";

/** `selected`: undefined = all songs, null = songs without a folder, string = folder id. */
export function FolderTree({
  folders,
  selected,
  q,
}: {
  folders: Folder[];
  selected: string | null | undefined;
  q: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<
    { kind: "create" } | { kind: "rename"; folder: Folder } | { kind: "delete"; folder: Folder } | null
  >(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (folder: string | null | undefined) => {
    const p = new URLSearchParams();
    if (folder === null) p.set("folder", "none");
    else if (folder !== undefined) p.set("folder", folder);
    if (q) p.set("q", q);
    const s = p.toString();
    router.push(s ? `/library?${s}` : "/library");
  };

  const close = () => {
    setDialog(null);
    setError(null);
    setName("");
  };

  async function submit(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) close();
    else
      setError(
        r.error === "folder_not_empty"
          ? "Thư mục không trống"
          : r.error === "name required"
            ? "Vui lòng nhập tên"
            : "Có lỗi xảy ra",
      );
  }

  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) byParent.set(f.parentId, [...(byParent.get(f.parentId) ?? []), f]);

  const item = (active: boolean) =>
    `min-h-11 flex-1 truncate rounded-[10px] px-3 text-left text-sm outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "bg-surface-2 font-medium text-foreground" : "text-muted-foreground"}`;

  const render = (parent: string | null, depth: number) =>
    (byParent.get(parent) ?? []).map((f) => (
      <div key={f.id}>
        <div
          data-testid="folder-item"
          className="group flex items-center gap-1"
          style={{ paddingLeft: depth * 12 }}
        >
          <button type="button" className={item(selected === f.id)} onClick={() => go(f.id)}>
            {f.name}
          </button>
          <button
            type="button"
            aria-label="Đổi tên thư mục"
            title="Đổi tên thư mục"
            className="inline-flex size-11 items-center justify-center rounded-[10px] text-muted-foreground opacity-0 transition-colors duration-150 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 group-hover:opacity-100 outline-none"
            onClick={() => {
              setName(f.name);
              setDialog({ kind: "rename", folder: f });
            }}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Xoá thư mục"
            title="Xoá thư mục"
            className="inline-flex size-11 items-center justify-center rounded-[10px] text-muted-foreground opacity-0 transition-colors duration-150 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 group-hover:opacity-100 outline-none"
            onClick={() => setDialog({ kind: "delete", folder: f })}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {render(f.id, depth + 1)}
      </div>
    ));

  return (
    <aside className="flex flex-col gap-1 self-start rounded-2xl border border-border bg-card p-3" data-testid="folder-tree">
      <Button
        variant="outline"
        size="sm"
        className="mb-1"
        onClick={() => {
          setName("");
          setDialog({ kind: "create" });
        }}
      >
        Thư mục mới
      </Button>
      <button type="button" className={item(selected === undefined)} onClick={() => go(undefined)}>
        Tất cả bài
      </button>
      <button type="button" className={item(selected === null)} onClick={() => go(null)}>
        Chưa phân loại
      </button>
      {render(null, 0)}

      {dialog?.kind === "create" || dialog?.kind === "rename" ? (
        <Modal title={dialog.kind === "create" ? "Thư mục mới" : "Đổi tên thư mục"} onClose={close}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(() =>
                dialog.kind === "create"
                  ? createFolderAction(name, typeof selected === "string" ? selected : null)
                  : renameFolderAction(dialog.folder.id, name),
              );
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              Tên thư mục
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Huỷ
              </Button>
              <Button type="submit" disabled={busy}>
                {dialog.kind === "create" ? "Tạo" : "Lưu"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialog?.kind === "delete" ? (
        <Modal title="Xoá thư mục?" onClose={close}>
          <p className="mb-3 text-sm">Xoá thư mục “{dialog.folder.name}”?</p>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const id = dialog.folder.id;
                void submit(async () => {
                  const r = await deleteFolderAction(id);
                  if (r.ok && selected === id) go(undefined);
                  return r;
                });
              }}
            >
              Xoá
            </Button>
          </div>
        </Modal>
      ) : null}
    </aside>
  );
}
