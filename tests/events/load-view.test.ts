import { describe, expect, it } from "vitest";
import {
  MSG_NEED_HTTPS, MSG_SW_INACTIVE, backgroundTitles, emptyBackgroundWarning, startBlockReason, summaryRows,
} from "@/app/events/[id]/load/load-view";
import { SNAP } from "../playback/fixtures";

describe("load-view", () => {
  it("start needs a successful load, a secure context and an active service worker", () => {
    expect(startBlockReason(false, true, false)).toBeNull(); // the load errors say why
    expect(startBlockReason(true, true, true)).toBeNull();
    expect(startBlockReason(true, true, false)).toBe(MSG_SW_INACTIVE);
    expect(startBlockReason(true, null, true)).toBe(MSG_SW_INACTIVE); // not known yet
    expect(startBlockReason(true, false, true)).toBe(MSG_NEED_HTTPS);
    expect(startBlockReason(true, false, false)).toBe(MSG_NEED_HTTPS);
    expect(MSG_NEED_HTTPS).toContain("HTTPS");
    // `next dev` runs without a service worker on purpose.
    expect(startBlockReason(true, true, false, true)).toBeNull();
  });

  it("warns when a cue falls back to an empty background playlist", () => {
    expect(emptyBackgroundWarning(SNAP)).toBe(false);
    const empty = { ...SNAP, background: [] };
    expect(emptyBackgroundWarning(empty)).toBe(true); // q0 is a background cue, q1 resumes it
    const stopOnly = { ...empty, cues: SNAP.cues.filter((c) => c.id === "q2") }; // onEnd: stop
    expect(emptyBackgroundWarning(stopOnly)).toBe(false);
    const resume = { ...empty, cues: SNAP.cues.filter((c) => c.id === "q1") };
    expect(emptyBackgroundWarning(resume)).toBe(true);
  });

  it("summarises the frozen script and the background playlist", () => {
    expect(summaryRows(SNAP)).toEqual([
      { position: 1, name: "Đón khách", kind: "Nhạc nền", song: "—", start: "—", end: "—", onEnd: "—" },
      { position: 2, name: "Cô dâu chú rể vào", kind: "Bài riêng", song: "c1", start: "0:45", end: "hết bài", onEnd: "Phát tiếp nhạc nền" },
      { position: 3, name: "Cảm ơn bố mẹ", kind: "Bài riêng", song: "c1", start: "0:00", end: "1:00", onEnd: "Dừng" },
    ]);
    expect(backgroundTitles(SNAP)).toEqual(["b1", "b2"]);
  });
});
