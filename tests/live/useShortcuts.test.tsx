import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShortcuts } from "@/app/live/components/useShortcuts";

function setup() {
  const h = { next: vi.fn(), background: vi.fn(), fadeStop: vi.fn(), volume: vi.fn() };
  const hook = renderHook(() => useShortcuts(h));
  const calls = () => h.next.mock.calls.length + h.background.mock.calls.length
    + h.fadeStop.mock.calls.length + h.volume.mock.calls.length;
  return { h, calls, ...hook };
}

afterEach(() => {
  cleanup(); // globals: false → no automatic RTL cleanup
  document.body.innerHTML = "";
});

describe("useShortcuts", () => {
  it("N→next, B→background, F→fadeStop, ArrowUp→volume(+0.05), ArrowDown→volume(-0.05)", () => {
    const { h } = setup();
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN" });
    fireEvent.keyDown(document.body, { key: "B", code: "KeyB" });
    fireEvent.keyDown(document.body, { key: "f", code: "KeyF" });
    expect(fireEvent.keyDown(document.body, { key: "ArrowUp", code: "ArrowUp" })).toBe(false); // no page scroll
    fireEvent.keyDown(document.body, { key: "ArrowDown", code: "ArrowDown" });
    expect(h.next).toHaveBeenCalledTimes(1);
    expect(h.background).toHaveBeenCalledTimes(1);
    expect(h.fadeStop).toHaveBeenCalledTimes(1);
    expect(h.volume.mock.calls).toEqual([[0.05], [-0.05]]);
  });

  it("matches the physical key when the layout/IME reports another character", () => {
    const { h } = setup();
    fireEvent.keyDown(document.body, { key: "Process", code: "KeyN" });
    expect(h.next).toHaveBeenCalledTimes(1);
  });

  it("Space calls nothing and is prevented, so it cannot press a focused button", () => {
    const { calls } = setup();
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    expect(fireEvent.keyDown(button, { key: " ", code: "Space" })).toBe(false);
    expect(fireEvent.keyUp(button, { key: " ", code: "Space" })).toBe(false);
    expect(calls()).toBe(0);
  });

  it("keys ignored inside input, textarea, select and contenteditable", () => {
    const { calls } = setup();
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    editable.appendChild(inner);
    document.body.append(input, area, select, editable);
    for (const el of [input, area, select, editable, inner]) {
      fireEvent.keyDown(el, { key: "n", code: "KeyN" });
      fireEvent.keyDown(el, { key: "ArrowUp", code: "ArrowUp" });
      // Space types a space there: not prevented.
      expect(fireEvent.keyDown(el, { key: " ", code: "Space" })).toBe(true);
    }
    expect(calls()).toBe(0);
  });

  it("text-like input types are typing targets; range, checkbox, radio and button inputs are not", () => {
    const { h, calls } = setup();
    for (const type of ["text", "search", "number", "email", "password", "tel", "url", ""]) {
      const input = document.createElement("input");
      if (type) input.type = type;
      document.body.appendChild(input);
      fireEvent.keyDown(input, { key: "f", code: "KeyF" });
    }
    expect(calls()).toBe(0);
    for (const type of ["range", "checkbox", "radio", "button"]) {
      const input = document.createElement("input");
      input.type = type;
      document.body.appendChild(input);
      input.focus();
      fireEvent.keyDown(input, { key: "f", code: "KeyF" });
    }
    expect(h.fadeStop).toHaveBeenCalledTimes(4);
  });

  it("with focus on the master slider (range), F and N still work; its arrows stay native", () => {
    const { h } = setup();
    const slider = document.createElement("input");
    slider.type = "range";
    document.body.appendChild(slider);
    slider.focus();
    fireEvent.keyDown(slider, { key: "f", code: "KeyF" });
    fireEvent.keyDown(slider, { key: "n", code: "KeyN" });
    expect(h.fadeStop).toHaveBeenCalledTimes(1);
    expect(h.next).toHaveBeenCalledTimes(1);
    // The slider moves itself on arrows; a second +5% on top would double the step.
    expect(fireEvent.keyDown(slider, { key: "ArrowUp", code: "ArrowUp" })).toBe(true);
    expect(h.volume).not.toHaveBeenCalled();
    // Space on the slider is still swallowed.
    expect(fireEvent.keyDown(slider, { key: " ", code: "Space" })).toBe(false);
  });

  it("disabled (exit confirm open): actions ignored, Space still swallowed", () => {
    const h = { next: vi.fn(), background: vi.fn(), fadeStop: vi.fn(), volume: vi.fn() };
    const { rerender } = renderHook(({ on }) => useShortcuts(h, on), { initialProps: { on: false } });
    fireEvent.keyDown(document.body, { key: "f", code: "KeyF" });
    fireEvent.keyDown(document.body, { key: "ArrowUp", code: "ArrowUp" });
    expect(h.fadeStop).not.toHaveBeenCalled();
    expect(h.volume).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(document.body, { key: " ", code: "Space" })).toBe(false);
    rerender({ on: true });
    fireEvent.keyDown(document.body, { key: "f", code: "KeyF" });
    expect(h.fadeStop).toHaveBeenCalledTimes(1);
  });

  it("ignores auto-repeat and modifier combinations (Ctrl+F stays the browser's)", () => {
    const { calls } = setup();
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", repeat: true });
    fireEvent.keyDown(document.body, { key: "ArrowUp", code: "ArrowUp", repeat: true });
    fireEvent.keyDown(document.body, { key: "f", code: "KeyF", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "b", code: "KeyB", metaKey: true });
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", altKey: true });
    expect(calls()).toBe(0);
  });

  it("uses the latest handlers and removes its listeners on unmount", () => {
    const first = { next: vi.fn(), background: vi.fn(), fadeStop: vi.fn(), volume: vi.fn() };
    const second = { ...first, next: vi.fn() };
    const { rerender, unmount } = renderHook(({ h }) => useShortcuts(h), { initialProps: { h: first } });
    rerender({ h: second });
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN" });
    expect(first.next).not.toHaveBeenCalled();
    expect(second.next).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN" });
    expect(fireEvent.keyDown(document.body, { key: " ", code: "Space" })).toBe(true);
    expect(second.next).toHaveBeenCalledTimes(1);
  });
});
