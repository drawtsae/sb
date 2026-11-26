import { describe, expect, it } from "vitest";
import { transitionLabel } from "@/app/live/components/transition-label";
import { DEFAULT_SETTINGS, type Cue, type EventSettings } from "@/lib/types";

function cue(partial: Partial<Cue> & Pick<Cue, "id">): Cue {
  return {
    position: 0, kind: "song", name: partial.id, songId: null, startSec: 0, endSec: null, fadeInSec: null,
    fadeOutSec: null, volume: 100, onEnd: "resume_background", note: "", transition: null, ...partial,
  };
}

const S: EventSettings = { ...DEFAULT_SETTINGS }; // cueFadeSec 3, defaultTransition crossfade

describe("transitionLabel", () => {
  it("a crossfade cue with the default 3 s fade", () => {
    expect(transitionLabel([cue({ id: "a" })], 0, S)).toBe("Crossfade 3s");
  });

  it("fade_out_in after a song cue: that cue's fade-out, then this cue's fade-in", () => {
    const cues = [cue({ id: "a", fadeOutSec: 2 }), cue({ id: "b", transition: "fade_out_in", fadeInSec: 2 })];
    expect(transitionLabel(cues, 1, S)).toBe("Fade out → In 2s + 2s");
  });

  it("fade_out_in after a background cue: the background fades over the incoming fade-in", () => {
    const cues = [
      cue({ id: "a", kind: "background", fadeOutSec: 7 }),
      cue({ id: "b", transition: "fade_out_in", fadeInSec: 2.5 }),
    ];
    expect(transitionLabel(cues, 1, S)).toBe("Fade out → In 2.5s + 2.5s");
  });

  it("fade_out_in as the first cue uses its own fade-in for both parts", () => {
    expect(transitionLabel([cue({ id: "a", transition: "fade_out_in" })], 0, S)).toBe("Fade out → In 3s + 3s");
  });

  it("the default transition applies to cues without their own", () => {
    const s: EventSettings = { ...S, defaultTransition: "fade_out_in" };
    expect(transitionLabel([cue({ id: "a" })], 0, s)).toBe("Fade out → In 3s + 3s");
  });

  it("a background-kind cue", () => {
    expect(transitionLabel([cue({ id: "a", kind: "background" })], 0, S)).toBe("Nhạc nền");
  });

  it("legacy objects with no transition / defaultTransition", () => {
    const legacyCue = cue({ id: "a" }) as Partial<Cue>;
    delete legacyCue.transition;
    const legacySettings = { ...S } as Partial<EventSettings>;
    delete legacySettings.defaultTransition;
    expect(transitionLabel([legacyCue as Cue], 0, legacySettings as EventSettings)).toBe("Crossfade 3s");
  });

  it("non-integer seconds print one decimal", () => {
    expect(transitionLabel([cue({ id: "a", fadeInSec: 1.25 })], 0, S)).toBe("Crossfade 1.3s");
  });
});
