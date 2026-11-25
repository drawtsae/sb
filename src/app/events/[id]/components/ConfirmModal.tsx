"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/app/library/components/Modal";

export function ConfirmModal({
  title,
  detail,
  confirmLabel = "Xoá",
  onConfirm,
  onClose,
}: {
  title: string;
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      {detail ? <p className="mb-3 text-sm">{detail}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
