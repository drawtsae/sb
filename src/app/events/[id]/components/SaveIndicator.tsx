"use client";

import type { SaveStatus } from "./useAutosave";

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "error") {
    return (
      <button
        type="button"
        data-testid="save-indicator"
        onClick={onRetry}
        className="text-sm font-medium text-destructive underline"
      >
        Lỗi lưu, thử lại
      </button>
    );
  }
  return (
    <span data-testid="save-indicator" role="status" className="text-sm text-muted-foreground">
      {status === "saving" ? "Đang lưu…" : "Đã lưu"}
    </span>
  );
}
