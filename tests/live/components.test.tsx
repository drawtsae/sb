import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundPanel } from "@/app/live/components/BackgroundPanel";
import { ControlBar } from "@/app/live/components/ControlBar";
import { CueColumn } from "@/app/live/components/CueColumn";
import { NowPlaying } from "@/app/live/components/NowPlaying";
import { EMPTY_INFO } from "@/app/live/components/useLiveEngine";
import type { ShowSnapshot } from "@/lib/types";
import { SNAP, run } from "../playback/fixtures";

afterEach(cleanup);

const snap: ShowSnapshot = {
  ...SNAP,
  cues: SNAP.cues.map((c) => (c.id === "q1" ? { ...c, note: "chờ MC giới thiệu" } : c.id === "q2" ? { ...c, note: "mời bố mẹ lên" } : c)),
};
const info = (songId: string, t: number, duration: number, paused = false) => ({ songId, t, duration, paused });

describe("Live layout", () => {
  it("cue list: ✓ played, ▶ current, [Dừng], current and next notes; click jumps", () => {
    const { state } = run([{ type: "GO_CUE", index: 0 }, { type: "GO_CUE", index: 1 }], undefined, snap);
    const onGo = vi.fn();
    render(<CueColumn snap={snap} state={state} disabled={false} onGo={onGo} />);
    const rows = screen.getAllByTestId("cue-row");
    expect(rows[0]).toHaveTextContent("✓");
    expect(rows[0]).toHaveTextContent("1. Đón khách (nhạc nền)");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[1]).toHaveTextContent("▶");
    expect(rows[2]).toHaveTextContent("[Dừng]");
    expect(rows[1]).not.toHaveTextContent("[Dừng]");
    expect(screen.getByText("chờ MC giới thiệu")).toBeInTheDocument();
    expect(screen.getByText("mời bố mẹ lên")).toBeInTheDocument();
    fireEvent.click(rows[2], { detail: 1 });
    expect(onGo).toHaveBeenCalledWith(2);
  });

  it("cue list: clicking the cue that is playing does nothing (no audible restart)", () => {
    const onGo = vi.fn();
    const playing = run([{ type: "GO_CUE", index: 1 }], undefined, snap).state;
    const { rerender } = render(<CueColumn snap={snap} state={playing} disabled={false} onGo={onGo} />);
    let rows = screen.getAllByTestId("cue-row");
    expect(rows[1]).toHaveAttribute("title", "Đang phát");
    fireEvent.click(rows[1], { detail: 1 });
    expect(onGo).not.toHaveBeenCalled();
    fireEvent.click(rows[2], { detail: 1 });
    expect(onGo).toHaveBeenCalledWith(2);

    // Once the cue is fading out (ending), clicking it plays it again.
    onGo.mockClear();
    const ending = { ...playing, cue: { ...playing.cue, ending: true } };
    rerender(<CueColumn snap={snap} state={ending} disabled={false} onGo={onGo} />);
    rows = screen.getAllByTestId("cue-row");
    expect(rows[1]).not.toHaveAttribute("title");
    fireEvent.click(rows[1], { detail: 1 });
    expect(onGo).toHaveBeenCalledWith(1);
  });

  it("now playing: cue with remaining time and end behaviour; silent banner; background", () => {
    const cue = run([{ type: "GO_CUE", index: 2 }], undefined, snap).state;
    const { rerender } = render(
      <NowPlaying snap={snap} state={cue} sample={{ bg: EMPTY_INFO, cue: info("c1", 42, 190) }} />,
    );
    const now = screen.getByTestId("now-playing");
    expect(now).toHaveTextContent('ĐANG PHÁT: [Tiết mục] Cảm ơn bố mẹ — "c1"');
    expect(now).toHaveTextContent("0:42 / 1:00");
    expect(now).toHaveTextContent("còn 0:13"); // to the fade-out start (60 − 5 s)
    expect(now).toHaveTextContent("→ hết bài: dừng");

    const resume = run([{ type: "GO_CUE", index: 1 }], undefined, snap).state;
    rerender(<NowPlaying snap={snap} state={resume} sample={{ bg: EMPTY_INFO, cue: info("c1", 50, 190) }} />);
    expect(screen.getByTestId("now-playing")).toHaveTextContent("→ hết bài: phát tiếp nhạc nền");

    const silent = run([{ type: "GO_CUE", index: 1 }, { type: "FADE_STOP" }], undefined, snap).state;
    rerender(<NowPlaying snap={snap} state={silent} sample={{ bg: EMPTY_INFO, cue: EMPTY_INFO }} />);
    expect(screen.getByText("ĐANG IM LẶNG")).toBeInTheDocument();

    const bg = run([{ type: "START_BACKGROUND" }], undefined, snap).state;
    rerender(<NowPlaying snap={snap} state={bg} sample={{ bg: info("b1", 10, 200), cue: EMPTY_INFO }} />);
    expect(screen.getByTestId("now-playing")).toHaveTextContent('ĐANG PHÁT: [Nhạc nền] "b1"');
    expect(screen.getByTestId("now-playing")).toHaveTextContent("còn 3:10");
  });

  it("background panel: track position, next title, paused point, read-only bg volume, master slider", () => {
    const state = run([{ type: "START_BACKGROUND" }, { type: "GO_CUE", index: 1 }], undefined, snap).state;
    const onMaster = vi.fn();
    render(
      <BackgroundPanel snap={snap} state={state} sample={{ bg: info("b1", 135, 200, true), cue: EMPTY_INFO }} disabled={false} onMaster={onMaster} />,
    );
    expect(screen.getByTestId("bg-status")).toHaveTextContent("(tạm dừng ở 2:15)");
    expect(screen.getByText('▸ Bài 1/2: "b1"')).toBeInTheDocument();
    expect(screen.getByText('tiếp theo: "b2"')).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Âm lượng nền" })).toHaveAttribute("aria-valuenow", "70");
    const master = screen.getByRole("slider", { name: "Âm lượng tổng" });
    expect(master).toHaveValue("90");
    fireEvent.change(master, { target: { value: "60" } });
    expect(onMaster).toHaveBeenCalledWith(0.6);
    // A mouse drag must not leave the slider focused.
    master.focus();
    fireEvent.pointerUp(master);
    expect(master).not.toHaveFocus();
  });

  it("control bar: labels follow the mode; no instant stop; a mouse click drops focus", () => {
    const h = { onNext: vi.fn(), onBackground: vi.fn(), onFadeStop: vi.fn() };
    const { rerender } = render(
      <ControlBar nextCue={snap.cues[2]} mode="silent" hasBackground disabled={false} {...h} />,
    );
    expect(screen.getByRole("button", { name: "▶ TIẾT MỤC TIẾP: Cảm ơn bố mẹ" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Phát nhạc nền" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fade out & dừng" })).toBeDisabled(); // already silent

    rerender(<ControlBar nextCue={null} mode="cue" hasBackground disabled={false} {...h} />);
    expect(screen.getByRole("button", { name: "Hết kịch bản" })).toBeDisabled();
    const back = screen.getByRole("button", { name: "Về nhạc nền" });
    back.focus();
    fireEvent.click(back, { detail: 1 });
    expect(h.onBackground).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Fade out & dừng" }), { detail: 1 });
    expect(h.onFadeStop).toHaveBeenCalledTimes(1);
  });
});
