import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/server/auth/require";
import { getDb } from "@/server/db/client";
import { listEvents } from "@/server/repo/events";
import { EventList } from "./components/EventList";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireUser("/events");
  const events = listEvents(getDb());
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl p-6">
        <EventList events={events} />
      </div>
    </AppShell>
  );
}
