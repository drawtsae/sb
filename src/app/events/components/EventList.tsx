"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";
import type { EventRecord } from "@/lib/types";
import {
  createEventAction,
  deleteEventAction,
  duplicateEventAction,
  importEventAction,
  renameEventAction,
} from "../actions";

type Dlg =
  | { kind: "create" }
  | { kind: "duplicate"; event: EventRecord }
  | { kind: "rename"; event: EventRecord }
  | { kind: "delete"; event: EventRecord }
  | null;

const fmt = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function EventList({ events }: { events: EventRecord[] }) {
  const router = useRouter();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ title: string; contentHash: string }[]>([]);
  const [importedId, setImportedId] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImportError(null);
    setMissing([]);
    setImportedId(null);
    setBusy(true);
    const r = await importEventAction(await file.text());
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) {
      setImportError(r.error);
      return;
    }
    if (r.missing.length === 0) router.push(`/events/${r.eventId}`);
    else {
      setMissing(r.missing);
      setImportedId(r.eventId);
    }
  }

  const close = () => {
    setDlg(null);
    setError(null);
  };

  async function submitName() {
    if (!dlg || dlg.kind === "delete") return;
    if (!name.trim()) {
      setError("Vui lòng nhập tên chương trình");
      return;
    }
    setBusy(true);
    const r =
      dlg.kind === "create"
        ? await createEventAction(name)
        : dlg.kind === "rename"
          ? await renameEventAction(dlg.event.id, name)
          : await duplicateEventAction(dlg.event.id, name);
    setBusy(false);
    if (!r.ok) {
      setError("Có lỗi xảy ra");
      return;
    }
    close();
    if (dlg.kind === "create") router.push(`/events/${(r as { data: { id: string } }).data.id}`);
    else router.refresh();
  }

  async function remove(ev: EventRecord) {
    setBusy(true);
    const r = await deleteEventAction(ev.id);
    setBusy(false);
    if (r.ok) {
      close();
      router.refresh();
    } else setError("Có lỗi xảy ra");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Chương trình</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="import-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload data-icon="inline-start" />
            Nhập JSON
          </Button>
          <Button
            onClick={() => {
              setName("");
              setDlg({ kind: "create" });
            }}
          >
            <Plus data-icon="inline-start" />
            Tạo chương trình
          </Button>
        </div>
      </div>

      {importError ? <p className="text-sm text-destructive">{importError}</p> : null}
      {importedId ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm" data-testid="import-missing">
          <p className="font-medium">Thiếu bài trong kho:</p>
          <ul className="list-disc pl-5">
            {missing.map((m) => (
              <li key={m.contentHash}>{m.title}</li>
            ))}
          </ul>
          <Link href={`/events/${importedId}`} className="mt-2 inline-flex h-11 items-center text-primary underline underline-offset-2 hover:text-primary/80">
            Mở chương trình đã nhập
          </Link>
        </div>
      ) : null}

      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Chưa có chương trình nào</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {events.map((ev) => (
          <li
            key={ev.id}
            data-testid="event-row"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-4 transition-colors duration-150 hover:bg-surface-2"
          >
            <div className="flex flex-col">
              <Link href={`/events/${ev.id}`} className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 outline-none rounded-[10px]">
                {ev.name}
              </Link>
              <span className="text-xs text-muted-foreground">Cập nhật {fmt.format(new Date(ev.updatedAt))}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Link
                href={`/events/${ev.id}/load`}
                className="rounded-[10px] px-2 text-sm text-foreground underline-offset-2 transition-colors duration-150 hover:bg-surface-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 outline-none inline-flex h-11 items-center"
              >
                Kiểm tra &amp; nạp
              </Link>
              <a
                href={`/api/events/${ev.id}/export`}
                download
                className="rounded-[10px] px-2 text-sm text-foreground underline-offset-2 transition-colors duration-150 hover:bg-surface-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 outline-none inline-flex h-11 items-center"
              >
                Xuất JSON
              </a>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setName(ev.name);
                  setDlg({ kind: "rename", event: ev });
                }}
              >
                Đổi tên
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setName(`${ev.name} (bản sao)`);
                  setDlg({ kind: "duplicate", event: ev });
                }}
              >
                Nhân bản
              </Button>
              <Button size="xs" variant="destructive" onClick={() => setDlg({ kind: "delete", event: ev })}>
                Xoá
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {dlg && dlg.kind !== "delete" ? (
        <Modal title={
            dlg.kind === "create" ? "Tạo chương trình" : dlg.kind === "rename" ? "Đổi tên" : "Nhân bản chương trình"
          } onClose={close}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitName();
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              Tên chương trình
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
                {dlg.kind === "create" ? "Tạo" : dlg.kind === "rename" ? "Lưu" : "Nhân bản"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dlg?.kind === "delete" ? (
        <Modal title="Xoá chương trình này? Không thể hoàn tác." onClose={close}>
          <p className="mb-3 text-sm">“{dlg.event.name}”</p>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove(dlg.event)}>
              Xoá
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
