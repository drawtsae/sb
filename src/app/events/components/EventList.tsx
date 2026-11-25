"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";
import type { EventRecord } from "@/lib/types";
import { createEventAction, deleteEventAction, duplicateEventAction, renameEventAction } from "../actions";

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chương trình</h1>
        <Button
          onClick={() => {
            setName("");
            setDlg({ kind: "create" });
          }}
        >
          Tạo chương trình
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có chương trình nào</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {events.map((ev) => (
          <li
            key={ev.id}
            data-testid="event-row"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="flex flex-col">
              <Link href={`/events/${ev.id}`} className="font-medium underline-offset-2 hover:underline">
                {ev.name}
              </Link>
              <span className="text-xs text-muted-foreground">Cập nhật {fmt.format(new Date(ev.updatedAt))}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Link
                href={`/events/${ev.id}/load`}
                className="rounded-md px-2 py-1 text-sm underline-offset-2 hover:underline"
              >
                Kiểm tra &amp; nạp
              </Link>
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
                className="rounded-md border bg-background px-2 py-1.5"
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
