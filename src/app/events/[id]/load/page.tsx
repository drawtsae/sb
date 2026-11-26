import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/server/auth/require";
import { LoadClient } from "./LoadClient";

export const dynamic = "force-dynamic";

export default async function LoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/events/${id}/load`);
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl p-6">
        <LoadClient eventId={id} />
      </div>
    </AppShell>
  );
}
