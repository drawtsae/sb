"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { sha256Hex, uploadFile } from "@/lib/library/hash";
import type { Song } from "@/lib/types";
import { Modal } from "./Modal";
import { uploadErrorText } from "./upload-errors";

type Status = "queued" | "hashing" | "uploading" | "error";
interface Item {
  id: number;
  file: File;
  status: Status;
  progress: number;
  error?: string;
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav)$/i;

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err: (e: unknown) => void) => void };
}

async function walk(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File>((ok, err) => entry.file!(ok, err));
    if (AUDIO_EXT.test(f.name)) out.push(f);
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns batches; keep reading until it returns an empty batch.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
      if (batch.length === 0) break;
      for (const e of batch) await walk(e, out);
    }
  }
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const entries: FsEntry[] = [];
  for (const it of Array.from(dt.items)) {
    const e = (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  if (entries.length === 0) return Array.from(dt.files);
  for (const e of entries) {
    if (e.isDirectory) await walk(e, out);
    else if (e.file) out.push(await new Promise<File>((ok, err) => e.file!(ok, err)));
  }
  return out;
}

export function UploadDropzone({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [items, setItems] = useState<Item[]>([]);
  const [dup, setDup] = useState<{ song: Song; file: File; resolve: (add: boolean) => void } | null>(null);
  const [over, setOver] = useState(false);

  const patch = (id: number, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const drop = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  async function process(item: Item) {
    try {
      patch(item.id, { status: "hashing", progress: 0, error: undefined });
      const hash = await sha256Hex(item.file);
      const res = await fetch(`/api/songs/by-hash?h=${hash}`);
      if (!res.ok) throw Object.assign(new Error("by-hash"), { reason: "server_error" });
      const { song } = (await res.json()) as { song: Song | null };
      if (song) {
        const add = await new Promise<boolean>((resolve) => setDup({ song, file: item.file, resolve }));
        setDup(null);
        if (!add) {
          drop(item.id);
          return;
        }
      }
      patch(item.id, { status: "uploading", progress: 0 });
      await uploadFile(item.file, folderId, (p) => patch(item.id, { progress: p }));
      drop(item.id);
      router.refresh();
    } catch (e) {
      patch(item.id, { status: "error", error: uploadErrorText((e as { reason?: string }).reason) });
    }
  }

  // Files are processed one at a time; the server streams each upload anyway.
  const enqueue = (item: Item) => {
    chain.current = chain.current.then(() => process(item));
  };

  function addFiles(files: File[]) {
    const fresh = files.map<Item>((file) => ({
      id: nextId.current++,
      file,
      status: "queued",
      progress: 0,
    }));
    setItems((xs) => [...xs, ...fresh]);
    fresh.forEach(enqueue);
  }

  return (
    <div
      className={`rounded-2xl border border-dashed border-border bg-card p-4 transition-colors duration-150 ${over ? "border-primary bg-surface-2" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void filesFromDrop(e.dataTransfer).then(addFiles);
      }}
    >
      <div className="flex items-center gap-3">
        <Button onClick={() => input.current?.click()}>
          <Upload data-icon="inline-start" />
          Tải nhạc lên
        </Button>
        <span className="text-sm text-muted-foreground">hoặc kéo thả file / thư mục vào đây</span>
        <input
          ref={input}
          data-testid="upload-input"
          type="file"
          hidden
          multiple
          accept=".mp3,.m4a,.aac,.wav"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) addFiles(files);
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} data-testid="upload-item" className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
              {it.status === "error" ? (
                <>
                  <span className="text-destructive">{it.error}</span>
                  <Button size="xs" variant="outline" onClick={() => enqueue(it)}>
                    Thử lại
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => drop(it.id)}>
                    Bỏ
                  </Button>
                </>
              ) : (
                <>
                  <progress className="w-40 accent-primary" max={1} value={it.status === "uploading" ? it.progress : 0} />
                  <span className="w-24 text-xs text-muted-foreground">
                    {it.status === "queued" ? "Đang chờ" : it.status === "hashing" ? "Đang kiểm tra" : `${Math.round(it.progress * 100)}%`}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {dup ? (
        <Modal title="Bài này đã có trong kho" onClose={() => dup.resolve(false)}>
          <p className="mb-3 text-sm">
            “{dup.file.name}” trùng với bài “{dup.song.title}” đã có.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dup.resolve(false)}>
              Bỏ qua
            </Button>
            <Button onClick={() => dup.resolve(true)}>Vẫn thêm</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
