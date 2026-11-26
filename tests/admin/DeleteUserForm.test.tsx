import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteUserForm } from "@/app/admin/users/DeleteUserForm";

afterEach(cleanup);

describe("DeleteUserForm", () => {
  it("asks for confirmation before deleting; Huỷ deletes nothing", async () => {
    const action = vi.fn(async (fd: FormData) => void fd);
    render(<DeleteUserForm id="u1" email="a@x.com" action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Xoá tài khoản này? Không thể hoàn tác.");
    expect(dialog).toHaveTextContent("a@x.com");
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Xoá" }).at(-1)!);
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0][0] as FormData).get("id")).toBe("u1");
  });
});
