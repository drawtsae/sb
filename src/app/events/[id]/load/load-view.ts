/** Pure helpers for the Load page ("Kiểm tra & nạp"). */
import { formatTime } from "@/lib/time-format";
import type { ShowSnapshot } from "@/lib/types";

export const MSG_NEED_HTTPS =
  "Cần HTTPS: trang này đang mở qua kết nối không bảo mật nên không thể chạy offline. Hãy mở lại bằng địa chỉ https:// rồi nạp lại.";
export const MSG_SW_INACTIVE =
  "Chưa sẵn sàng offline (service worker chưa hoạt động). Hãy tải lại trang này khi còn mạng. Nếu vẫn không được, kiểm tra HTTPS.";
export const MSG_EMPTY_BACKGROUND =
  "Playlist nhạc nền trống — các tiết mục 'phát tiếp nhạc nền' sẽ kết thúc trong im lặng";

/**
 * Why "Bắt đầu tiệc" stays disabled although the load succeeded, or null when the show can start.
 * Live must keep working without internet, so it needs a secure context and an active service
 * worker controlling this page (it then serves /live from its precache). `secure` is null until
 * known (first client render). `devMode`: `next dev` deliberately runs without a service worker.
 */
export function startBlockReason(
  ok: boolean,
  secure: boolean | null,
  swControlled: boolean,
  devMode = false,
): string | null {
  if (!ok || devMode) return null;
  if (secure === false) return MSG_NEED_HTTPS;
  if (!swControlled || secure === null) return MSG_SW_INACTIVE;
  return null;
}

/** The background playlist is empty while some cue would fall back to it. */
export function emptyBackgroundWarning(snap: ShowSnapshot): boolean {
  if (snap.background.length > 0) return false;
  return snap.cues.some((c) => c.kind === "background" || c.onEnd === "resume_background");
}

export interface SummaryRow {
  position: number;
  name: string;
  kind: string;
  song: string;
  start: string;
  end: string;
  onEnd: string;
}

/** The frozen script as Live will play it, one row per cue in order. */
export function summaryRows(snap: ShowSnapshot): SummaryRow[] {
  return snap.cues.map((c, i) => {
    const base = { position: i + 1, name: c.name || "(chưa đặt tên)" };
    if (c.kind === "background") {
      return { ...base, kind: "Nhạc nền", song: "—", start: "—", end: "—", onEnd: "—" };
    }
    const song = c.songId ? snap.songs[c.songId] : undefined;
    return {
      ...base,
      kind: "Bài riêng",
      song: song?.title ?? "(không có bài)",
      start: formatTime(c.startSec),
      end: c.endSec === null ? "hết bài" : formatTime(c.endSec),
      onEnd: c.onEnd === "resume_background" ? "Phát tiếp nhạc nền" : "Dừng",
    };
  });
}

/** Background playlist titles, in playlist order. */
export function backgroundTitles(snap: ShowSnapshot): string[] {
  return snap.background.map((id) => snap.songs[id]?.title ?? "(không có bài)");
}
