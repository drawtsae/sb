import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveClient } from "@/app/live/LiveClient";
import { LIVE_KEY, saveLive, type LivePersisted } from "@/lib/offline/live-persist";
import { SNAPSHOT_KEY } from "@/lib/offline/snapshot";
import { SNAP } from "../playback/fixtures";

const SAVED: LivePersisted = {
  currentCueIndex: 1, playedCueIds: ["q0", "q1"], bgOrder: [0, 1], bgPos: 0, bgPositionSec: 20, savedAt: SNAP.takenAt,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("LiveClient resume prompt", () => {
  it("offers Tiếp tục từ chỗ cũ for a state saved with the same snapshot", async () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
    saveLive(SNAP.eventId, { ...SAVED, snapshotTakenAt: SNAP.takenAt });
    render(<LiveClient />);
    expect(await screen.findByRole("button", { name: "Tiếp tục từ chỗ cũ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu lại" })).toBeInTheDocument();
  });

  it("a state saved with another snapshot (re-loaded show): no prompt, and it is cleared", async () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
    saveLive(SNAP.eventId, { ...SAVED, snapshotTakenAt: "2026-11-20T00:00:00.000Z" });
    render(<LiveClient />);
    expect(await screen.findByRole("heading", { name: SNAP.eventName })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tiếp tục từ chỗ cũ" })).toBeNull();
    expect(localStorage.getItem(LIVE_KEY(SNAP.eventId))).toBeNull();
  });
});

describe("LiveClient soundboard layout", () => {
  it("top bar: LIVE, event name, master volume, offline status, Thoát; next-cue card; no links", async () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
    const { container } = render(<LiveClient />);
    expect(await screen.findByRole("heading", { name: SNAP.eventName })).toBeInTheDocument();
    const top = screen.getByRole("banner");
    expect(within(top).getByText("LIVE")).toBeInTheDocument();
    expect(within(top).getByRole("slider", { name: "Âm lượng tổng" })).toHaveValue("90");
    expect(within(top).getByRole("status")).toHaveTextContent(/offline/);
    expect(within(top).getByRole("button", { name: "Thoát" })).toBeInTheDocument();
    expect(screen.getByTestId("next-cue")).toHaveTextContent("1. Đón khách");
    expect(screen.getByText("Kiểu chuyển mặc định: Crossfade")).toBeInTheDocument();
    expect(screen.getByTestId("audio-decks")).toBeInTheDocument();
    // Mid-show nothing navigates away: no links in the top bar or the controls (only the start
    // overlay may link to "Kiểm tra & nạp" when music is missing, before anything plays).
    expect(container.querySelectorAll("header a, main a")).toHaveLength(0);
  });
});
