import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowSnapshot } from "@/lib/types";
import { SNAP } from "../playback/fixtures";

const loadShow = vi.fn();
vi.mock("@/lib/offline/music-cache", async (orig) => ({
  ...(await orig<typeof import("@/lib/offline/music-cache")>()),
  loadShow: (...a: unknown[]) => loadShow(...a),
  pruneMusicCache: async () => 0,
}));

const { LoadClient } = await import("@/app/events/[id]/load/LoadClient");
const { readSnapshot } = await import("@/lib/offline/snapshot");

function env({ secure, controlled }: { secure: boolean; controlled: boolean }) {
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { controller: controlled ? {} : null, addEventListener() {}, removeEventListener() {} },
    configurable: true,
  });
}

async function renderLoaded(snap: ShowSnapshot, durations: Record<string, number> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(snap)));
  vi.stubGlobal("caches", {});
  loadShow.mockResolvedValue({ ok: true, items: [], cueErrors: [], durations });
  await act(async () => {
    render(<LoadClient eventId="e1" />);
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const start = () => screen.getByRole("button", { name: "Bắt đầu tiệc" });

describe("LoadClient", () => {
  it("blocks Bắt đầu tiệc until a service worker controls the page", async () => {
    env({ secure: true, controlled: false });
    await renderLoaded(SNAP);
    expect(start()).toBeDisabled();
    expect(screen.getByTestId("start-blocked")).toHaveTextContent(
      "Chưa sẵn sàng offline (service worker chưa hoạt động). Hãy tải lại trang này khi còn mạng. Nếu vẫn không được, kiểm tra HTTPS.",
    );
  });

  it("blocks Bắt đầu tiệc on an insecure (http) page and says HTTPS is required", async () => {
    env({ secure: false, controlled: false });
    await renderLoaded(SNAP);
    expect(start()).toBeDisabled();
    expect(screen.getByTestId("start-blocked")).toHaveTextContent("Cần HTTPS");
  });

  it("enables Bắt đầu tiệc when loaded and offline-ready; shows the frozen script", async () => {
    env({ secure: true, controlled: true });
    await renderLoaded(SNAP);
    expect(start()).toBeEnabled();
    expect(screen.queryByTestId("start-blocked")).toBeNull();
    const rows = screen.getAllByTestId("summary-row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("2");
    expect(rows[1]).toHaveTextContent("Cô dâu chú rể vào");
    expect(rows[1]).toHaveTextContent("Bài riêng");
    expect(rows[1]).toHaveTextContent("c1");
    expect(rows[1]).toHaveTextContent("0:45");
    expect(rows[1]).toHaveTextContent("hết bài");
    expect(rows[1]).toHaveTextContent("Phát tiếp nhạc nền");
    expect(rows[2]).toHaveTextContent("1:00");
    expect(rows[2]).toHaveTextContent("Dừng");
    expect(screen.getByTestId("summary-background")).toHaveTextContent("b1");
    expect(screen.getByTestId("summary-background")).toHaveTextContent("b2");
  });

  it("saves the probed durations into the snapshot", async () => {
    env({ secure: true, controlled: true });
    await renderLoaded(SNAP, { c1: 188.4, b1: NaN, b2: 0 });
    const saved = readSnapshot()!;
    expect(saved.songs.c1.durationSec).toBe(188.4);
    expect(saved.songs.b1.durationSec).toBe(200);
    expect(saved.songs.b2.durationSec).toBe(180);
  });

  it("warns (without blocking) when cues fall back to an empty background playlist", async () => {
    env({ secure: true, controlled: true });
    await renderLoaded({ ...SNAP, background: [] });
    expect(screen.getByTestId("empty-bg-warning")).toHaveTextContent(
      "Playlist nhạc nền trống — các tiết mục 'phát tiếp nhạc nền' sẽ kết thúc trong im lặng",
    );
    expect(start()).toBeEnabled();
  });

  it("offline test: explicit steps and a button that opens Live", async () => {
    env({ secure: true, controlled: true });
    await renderLoaded(SNAP);
    await act(async () => screen.getByRole("button", { name: "Thử chế độ offline" }).click());
    const dialog = screen.getByRole("dialog");
    const steps = [...dialog.querySelectorAll("li")].map((li) => li.textContent);
    expect(steps).toEqual([
      "Tắt Wi-Fi.",
      'Bấm nút "Mở trang Live".',
      "Trên trang Live, tải lại (F5).",
      "Nếu trang hiện tên chương trình là đạt.",
    ]);
    expect(screen.getByRole("button", { name: "Mở trang Live" })).toBeEnabled();
  });
});
