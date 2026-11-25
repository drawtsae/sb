import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/server/auth/require";

// Placeholder: Task 10 replaces the body.
export default async function EventsPage() {
  const user = await requireUser("/events");
  return (
    <>
      <AppHeader user={user} />
      <main className="p-6">
        <h1 className="text-xl font-semibold">Sự kiện</h1>
      </main>
    </>
  );
}
