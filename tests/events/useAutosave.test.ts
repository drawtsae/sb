import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "@/app/events/[id]/components/useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutosave", () => {
  it("debounces 800ms saving→saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    expect(result.current.status).toBe("saved");
    expect(save).not.toHaveBeenCalled();
    rerender({ v: 2 });
    rerender({ v: 3 });
    expect(result.current.status).toBe("saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
    expect(result.current.status).toBe("saved");
  });

  it("error then retry calls save again", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.status).toBe("error");
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2);
    expect(result.current.status).toBe("saved");
  });
});
