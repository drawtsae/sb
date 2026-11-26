import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundPanel } from "@/app/live/components/BackgroundPanel";
import { ControlBar, MasterVolume, NextCue } from "@/app/live/components/ControlBar";
import { CueColumn, CueNotes } from "@/app/live/components/CueColumn";
import { NowPlaying } from "@/app/live/components/NowPlaying";
import { transitionLabel } from "@/app/live/components/transition-label";
import { EMPTY_INFO } from "@/app/live/components/useLiveEngine";
import type { ShowSnapshot } from "@/lib/types";
import { SNAP, run } from "../playback/fixtures";

afterEach(cleanup);

const snap: ShowSnapshot = {
  ...SNAP,
  cues: SNAP.cues.map((c) =>
    c.id === "q1"
      ? { ...c, note: "chờ MC giới thiệu" }
      : c.id === "q2"
        ? { ...c, note: "mời bố mẹ lên", transition: "fade_out_in" as const, fadeInSec: 2 }
        : c,
  ),
};
const info = (songId: string, t: number, duration: number, paused = false) => ({ songId, t, duration, paused });

describe("Live layout", () => {
  it("cue list: ✓ played, ▶ current, Dừng badge, transition label per row; Chọn jumps", () => {
    const { state } = run([{ type: "GO_CUE", index: 0 }, { type: "GO_CUE", index: 1 }], undefined, snap);
    const onGo = vi.fn();
    render(<CueColumn snap={snap} state={state} disabled={false} onGo={onGo} />);
    const rows = screen.getAllByTestId("cue-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute("data-played", "true");
    expect(within(rows[0]).getByText("Đã phát")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("01");
    expect(rows[0]).toHaveTextContent("Đón khách");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(within(rows[1]).getByText("Tiết mục hiện tại")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Dừng")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Dừng")).toBeNull();
    snap.cues.forEach((_, i) => expect(rows[i]).toHaveTextContent(transitionLabel(snap.cues, i, snap.settings)));
    expect(rows[0]).toHaveTextContent("Nhạc nền");
    expect(rows[1]).toHaveTextContent("Crossfade 3s");
    expect(rows[2]).toHaveTextContent("Fade out → In 3s + 2s");
    fireEvent.click(within(rows[2]).getByRole("button", { name: "Chọn" }), { detail: 1 });
    expect(onGo).toHaveBeenCalledWith(2);
  });

  it("cue list: the playing row reads Đang phát and cannot be clicked; other rows have Chọn", () => {
    const onGo = vi.fn();
    const playing = run([{ type: "GO_CUE", index: 1 }], undefined, snap).state;
    const { rerender } = render(<CueColumn snap={snap} state={playing} disabled={false} onGo={onGo} />);
    let rows = screen.getAllByTestId("cue-row");
    expect(rows[1]).toHaveTextContent("Đang phát");
    expect(within(rows[1]).queryByRole("button")).toBeNull();
    fireEvent.click(rows[1], { detail: 1 });
    expect(onGo).not.toHaveBeenCalled();
    expect(within(rows[0]).getByRole("button", { name: "Chọn" })).toBeEnabled();
    fireEvent.click(within(rows[2]).getByRole("button", { name: "Chọn" }), { detail: 1 });
    expect(onGo).toHaveBeenCalledWith(2);

    // Once the cue is fading out (ending), it can be played again.
    onGo.mockClear();
    const ending = { ...playing, cue: { ...playing.cue, ending: true } };
    rerender(<CueColumn snap={snap} state={ending} disabled={false} onGo={onGo} />);
    rows = screen.getAllByTestId("cue-row");
    expect(rows[1]).not.toHaveTextContent("Đang phát");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Chọn" }), { detail: 1 });
    expect(onGo).toHaveBeenCalledWith(1);

    // Before the operator starts, every Chọn is disabled.
    rerender(<CueColumn snap={snap} state={ending} disabled onGo={onGo} />);
    for (const b of screen.getAllByRole("button", { name: "Chọn" })) expect(b).toBeDisabled();
  });

  it("notes (Gợi ý): the current and the next cue's note", () => {
    const { state } = run([{ type: "GO_CUE", index: 1 }], undefined, snap);
    render(<CueNotes snap={snap} state={state} />);
    expect(screen.getByText("Gợi ý")).toBeInTheDocument();
    expect(screen.getByText("chờ MC giới thiệu")).toBeInTheDocument();
    expect(screen.getByText("mời bố mẹ lên")).toBeInTheDocument();
  });

  it("now playing: cue with remaining time and end behaviour; silent banner; background", () => {
    const cue = run([{ type: "GO_CUE", index: 2 }], undefined, snap).state;
    const { rerender } = render(
      <NowPlaying snap={snap} state={cue} sample={{ bg: EMPTY_INFO, cue: info("c1", 42, 190) }} />,
    );
    const now = screen.getByTestId("now-playing");
    expect(now).toHaveTextContent("ĐANG PHÁT");
    expect(now).toHaveTextContent("Tiết mục");
    expect(within(now).getByText("3. Cảm ơn bố mẹ")).toBeInTheDocument();
    expect(within(now).getByText("c1")).toBeInTheDocument();
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
    expect(screen.getByTestId("now-playing")).toHaveTextContent("Nhạc nền");
    expect(within(screen.getByTestId("now-playing")).getByText("b1")).toBeInTheDocument();
    expect(screen.getByTestId("now-playing")).toHaveTextContent("còn 3:10");
  });

  it("next-cue card: name, Kiểu: <label>, Chuyển bài ngay; Hết kịch bản at the end", () => {
    const onNext = vi.fn();
    const { rerender } = render(<NextCue snap={snap} index={2} disabled={false} onNext={onNext} />);
    const card = screen.getByTestId("next-cue");
    expect(card).toHaveTextContent("TIẾP THEO");
    expect(card).toHaveTextContent("3. Cảm ơn bố mẹ");
    expect(card).toHaveTextContent(`Kiểu: ${transitionLabel(snap.cues, 2, snap.settings)}`);
    expect(card).toHaveTextContent("Kiểu: Fade out → In 3s + 2s");
    const go = within(card).getByRole("button", { name: "Chuyển bài ngay" });
    go.focus();
    fireEvent.click(go, { detail: 1 });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveFocus();

    rerender(<NextCue snap={snap} index={null} disabled={false} onNext={onNext} />);
    expect(screen.getByTestId("next-cue")).toHaveTextContent("Hết kịch bản");
    expect(screen.getByRole("button", { name: "Chuyển bài ngay" })).toBeDisabled();
  });

  it("background panel: status, track position, next title, read-only bg volume", () => {
    const state = run([{ type: "START_BACKGROUND" }, { type: "GO_CUE", index: 1 }], undefined, snap).state;
    render(<BackgroundPanel snap={snap} state={state} sample={{ bg: info("b1", 135, 200, true), cue: EMPTY_INFO }} />);
    expect(screen.getByRole("heading", { name: /NHẠC NỀN/ })).toBeInTheDocument();
    expect(screen.getByTestId("bg-status")).toHaveTextContent("tạm dừng ở 2:15");
    expect(screen.getByText("Bài 1/2")).toBeInTheDocument();
    expect(screen.getByText("b1")).toBeInTheDocument();
    expect(screen.getByText("tiếp: b2")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Âm lượng nền" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByText("(chỉ xem)")).toBeInTheDocument();
  });

  it("master volume: slider bound to the handler; a mouse drag drops focus", () => {
    const onChange = vi.fn();
    render(<MasterVolume value={0.9} disabled={false} onChange={onChange} />);
    const master = screen.getByRole("slider", { name: "Âm lượng tổng" });
    expect(master).toHaveValue("90");
    expect(screen.getByText("90%")).toBeInTheDocument();
    fireEvent.change(master, { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith(0.6);
    master.focus();
    fireEvent.pointerUp(master);
    expect(master).not.toHaveFocus();
  });

  it("quick controls: labels follow the mode; no instant stop; default transition; click drops focus", () => {
    const h = { onBackground: vi.fn(), onFadeStop: vi.fn() };
    const { rerender } = render(
      <ControlBar settings={snap.settings} mode="silent" hasBackground disabled={false} {...h} />,
    );
    expect(screen.getByText("ĐIỀU KHIỂN NHANH")).toBeInTheDocument();
    expect(screen.getByText("Kiểu chuyển mặc định: Crossfade")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phát nhạc nền" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fade out & dừng" })).toBeDisabled(); // already silent
    expect(screen.queryByRole("button", { name: /instant|stop all|pause all|dừng ngay/i })).toBeNull();

    rerender(
      <ControlBar
        settings={{ ...snap.settings, defaultTransition: "fade_out_in" }}
        mode="cue"
        hasBackground
        disabled={false}
        {...h}
      />,
    );
    expect(screen.getByText("Kiểu chuyển mặc định: Fade out → In")).toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Về nhạc nền" });
    back.focus();
    fireEvent.click(back, { detail: 1 });
    expect(h.onBackground).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Fade out & dừng" }), { detail: 1 });
    expect(h.onFadeStop).toHaveBeenCalledTimes(1);
  });
});
