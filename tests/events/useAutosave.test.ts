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

  it("unmount within the debounce flushes the latest value", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    rerender({ v: 3 });
    expect(save).not.toHaveBeenCalled();
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush saves a pending value at once and resolves when it is saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: 1 } });
    await act(async () => expect(await result.current.flush()).toBe(true));
    expect(save).not.toHaveBeenCalled(); // nothing pending
    rerender({ v: 2 });
    await act(async () => expect(await result.current.flush()).toBe(true));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2);
    expect(result.current.status).toBe("saved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(1); // the debounce timer was cancelled
  });

  it("flush waits for an in-flight save and reports a failure (retrying a failed value once)", async () => {
    let finish!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (finish = r)))
      .mockRejectedValue(new Error("x"));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save).toHaveBeenCalledTimes(1);
    let done = false;
    let flushed: Promise<boolean> = Promise.resolve(false);
    act(() => {
      flushed = result.current.flush().then((ok) => ((done = true), ok));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(done).toBe(false);
    await act(async () => finish());
    await act(async () => expect(await flushed).toBe(true));
    expect(save).toHaveBeenCalledTimes(1);

    rerender({ v: 3 });
    await act(async () => expect(await result.current.flush()).toBe(false));
    expect(result.current.status).toBe("error");
    await act(async () => expect(await result.current.flush()).toBe(false)); // still failing
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("does not flush on unmount when nothing is pending", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useAutosave(1, save));
    unmount();
    expect(save).not.toHaveBeenCalled();
  });
});
