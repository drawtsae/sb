import { cleanup, render, screen } from "@testing-library/react";
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
