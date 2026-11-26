"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/app/events/[id]/components/ConfirmModal";

/** "Xoá" for one user, behind a confirmation (spec §6.9: every delete is confirmed). */
export function DeleteUserForm({
  id,
  email,
  action,
}: {
  id: string;
  email: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="button" variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        Xoá
      </Button>
      {confirming ? (
        <ConfirmModal
          title="Xoá tài khoản này? Không thể hoàn tác."
          detail={email}
          onClose={() => setConfirming(false)}
          onConfirm={() => form.current?.requestSubmit()}
        />
      ) : null}
    </form>
  );
}
