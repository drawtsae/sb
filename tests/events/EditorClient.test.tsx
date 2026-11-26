import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Cue, type EventDetail, type Song } from "@/lib/types";

const actions = vi.hoisted(() => ({
  upsertCueAction: vi.fn(),
  reorderCuesAction: vi.fn(),
  deleteCueAction: vi.fn(),
  updateSettingsAction: vi.fn(),
  addBackgroundTrackAction: vi.fn(),
  removeBackgroundTrackAction: vi.fn(),
  reorderBackgroundAction: vi.fn(),
}));
vi.mock("@/app/events/actions", () => actions);
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { EditorClient } = await import("@/app/events/[id]/components/EditorClient");

const song: Song = {
  id: "s1", folderId: null, title: "Bài 1", artist: null, durationSec: 120, fileName: "s1.mp3",
  fileSize: 10, mimeType: "audio/mpeg", contentHash: "h1",
};
const cue = (id: string, position: number, name: string): Cue => ({
  id, position, kind: "song", name, songId: "s1", startSec: 0, endSec: null, fadeInSec: null,
  fadeOutSec: null, volume: 100, onEnd: "stop", note: "", transition: null,
});
const detail: EventDetail = {
  event: { id: "e1", name: "Tiệc", eventDate: null, settings: DEFAULT_SETTINGS, updatedAt: "t" },
  background: [],
  cues: [cue("c1", 0, "Một"), cue("c2", 1, "Hai")],
  songs: { s1: song },
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const flushAsync = () => act(async () => new Promise((r) => setTimeout(r, 20)));
const indicator = () => screen.getByTestId("save-indicator");
const names = () => screen.getAllByLabelText("Tên tiết mục") as HTMLInputElement[];

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  push.mockReset();
  let n = 0;
  actions.upsertCueAction.mockImplementation(async (_e: string, c: Cue) => ({ ok: true, data: { ...c, id: c.id || `srv-${++n}` } }));
  actions.reorderCuesAction.mockResolvedValue({ ok: true });
  actions.updateSettingsAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("EditorClient", () => {
  it("a failed post-insert cue reorder shows Lỗi lưu, and its retry pushes the current order", async () => {
    actions.reorderCuesAction.mockResolvedValueOnce({ ok: false, error: "db" });
    render(<EditorClient detail={detail} allSongs={[song]} />);
    // Duplicate the first cue: the copy is inserted in the middle, so the order must be pushed.
    fireEvent.click(screen.getAllByRole("button", { name: "Nhân bản" })[0]);
    await flushAsync();
    expect(actions.upsertCueAction).toHaveBeenCalledTimes(1);
    expect(actions.reorderCuesAction).toHaveBeenCalledTimes(1);
    expect(indicator()).toHaveTextContent("Lỗi lưu, thử lại");

    fireEvent.click(indicator());
    await flushAsync();
    expect(actions.reorderCuesAction).toHaveBeenCalledTimes(2);
    expect(actions.reorderCuesAction).toHaveBeenLastCalledWith("e1", ["c1", "srv-1", "c2"]);
    expect(indicator()).toHaveTextContent("Đã lưu");
  });

  it("Kiểm tra & nạp waits for the pending cue save before navigating", async () => {
    const save = deferred<unknown>();
    actions.upsertCueAction.mockImplementationOnce(() => save.promise);
    render(<EditorClient detail={detail} allSongs={[song]} />);
    fireEvent.change(names()[0], { target: { value: "Một sửa" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
    await flushAsync();
    // The debounced save was flushed right away, and navigation waits for it.
    expect(actions.upsertCueAction).toHaveBeenCalledTimes(1);
    expect(actions.upsertCueAction.mock.calls[0][1]).toMatchObject({ id: "c1", name: "Một sửa" });
    expect(push).not.toHaveBeenCalled();
    await act(async () => save.resolve({ ok: true, data: cue("c1", 0, "Một sửa") }));
    await flushAsync();
    expect(push).toHaveBeenCalledWith("/events/e1/load");
  });

  it("Kiểm tra & nạp refuses to navigate while a save is in error", async () => {
    actions.upsertCueAction.mockResolvedValue({ ok: false, error: "db" });
    render(<EditorClient detail={detail} allSongs={[song]} />);
    fireEvent.change(names()[1], { target: { value: "Hai sửa" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
    await flushAsync();
    expect(actions.upsertCueAction).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Còn thay đổi chưa lưu được — hãy sửa lỗi trước khi nạp");

    // Once the retry saves it, the message goes away and the button navigates.
    actions.upsertCueAction.mockResolvedValue({ ok: true, data: cue("c2", 1, "Hai sửa") });
    fireEvent.click(indicator());
    await flushAsync();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
    await flushAsync();
    expect(push).toHaveBeenCalledWith("/events/e1/load");
  });

  it("Kiểm tra & nạp refuses while a structural save (reorder) is in error", async () => {
    actions.reorderCuesAction.mockResolvedValue({ ok: false, error: "db" });
    render(<EditorClient detail={detail} allSongs={[song]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Chuyển xuống" })[0]);
    await flushAsync();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
    await flushAsync();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Còn thay đổi chưa lưu được");
  });

  it("← Chương trình also flushes the pending settings save before leaving", async () => {
    render(<EditorClient detail={detail} allSongs={[song]} />);
    fireEvent.change(screen.getByLabelText("Chuyển tiết mục"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "← Chương trình" }));
    await flushAsync();
    expect(actions.updateSettingsAction).toHaveBeenCalledWith("e1", expect.objectContaining({ cueFadeSec: 5 }));
    expect(push).toHaveBeenCalledWith("/events");
  });
  describe("transition fields", () => {
    const optionTexts = (el: HTMLElement) => Array.from((el as HTMLSelectElement).options).map((o) => o.text);

    it("a song cue shows Kiểu chuyển defaulting to Theo cài đặt chung", () => {
      render(<EditorClient detail={detail} allSongs={[song]} />);
      const sel = screen.getAllByLabelText("Kiểu chuyển")[0] as HTMLSelectElement;
      expect(optionTexts(sel)).toEqual(["Theo cài đặt chung", "Crossfade", "Fade out → In"]);
      expect(sel.value).toBe("");
      expect(sel.selectedOptions[0].text).toBe("Theo cài đặt chung");
    });

    it("choosing Fade out → In saves transition fade_out_in", async () => {
      render(<EditorClient detail={detail} allSongs={[song]} />);
      fireEvent.change(screen.getAllByLabelText("Kiểu chuyển")[0], { target: { value: "fade_out_in" } });
      fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
      await flushAsync();
      expect(actions.upsertCueAction).toHaveBeenLastCalledWith("e1", expect.objectContaining({ id: "c1", transition: "fade_out_in" }));
    });

    it("choosing Theo cài đặt chung saves transition null", async () => {
      const d: EventDetail = { ...detail, cues: [{ ...cue("c1", 0, "Một"), transition: "fade_out_in" }] };
      render(<EditorClient detail={d} allSongs={[song]} />);
      fireEvent.change(screen.getByLabelText("Kiểu chuyển"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
      await flushAsync();
      expect(actions.upsertCueAction).toHaveBeenLastCalledWith("e1", expect.objectContaining({ id: "c1", transition: null }));
    });

    it("a background-kind cue has no Kiểu chuyển control and its row says Nhạc nền", () => {
      const d: EventDetail = { ...detail, cues: [{ ...cue("c1", 0, "Nền"), kind: "background", songId: null }] };
      render(<EditorClient detail={d} allSongs={[song]} />);
      expect(screen.queryByLabelText("Kiểu chuyển")).toBeNull();
      expect(screen.getByTestId("cue-item")).toHaveTextContent("Nhạc nền");
    });

    it("the settings panel offers only Crossfade and Fade out → In and saves defaultTransition", async () => {
      render(<EditorClient detail={detail} allSongs={[song]} />);
      const sel = screen.getByLabelText("Kiểu chuyển mặc định");
      expect(optionTexts(sel)).toEqual(["Crossfade", "Fade out → In"]);
      fireEvent.change(sel, { target: { value: "fade_out_in" } });
      fireEvent.click(screen.getByRole("button", { name: "Kiểm tra & nạp" }));
      await flushAsync();
      expect(actions.updateSettingsAction).toHaveBeenCalledWith("e1", expect.objectContaining({ defaultTransition: "fade_out_in" }));
    });

    it("each cue row shows its transition text", () => {
      const d: EventDetail = {
        ...detail,
        cues: [cue("c1", 0, "Một"), { ...cue("c2", 1, "Hai"), transition: "fade_out_in", fadeInSec: 2 }],
      };
      render(<EditorClient detail={d} allSongs={[song]} />);
      const rows = screen.getAllByTestId("cue-item");
      expect(rows[0]).toHaveTextContent("Crossfade 3s");
      expect(rows[1]).toHaveTextContent("Fade out → In 3s + 2s"); // c1 fades out 3 s, then c2 fades in 2 s
    });

    it("the default transition drives the row text of cues without their own", () => {
      render(<EditorClient detail={detail} allSongs={[song]} />);
      const row = () => screen.getAllByTestId("cue-item")[0];
      expect(row()).toHaveTextContent("Crossfade 3s");
      fireEvent.change(screen.getByLabelText("Kiểu chuyển mặc định"), { target: { value: "fade_out_in" } });
      expect(row()).toHaveTextContent("Fade out → In 3s + 3s");
    });
  });
});
