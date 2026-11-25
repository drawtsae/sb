import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/server/auth/require";

// Placeholder: Task 9 replaces the body.
export default async function LibraryPage() {
  const user = await requireUser("/library");
  return (
    <>
      <AppHeader user={user} />
      <main className="p-6">
        <h1 className="text-xl font-semibold">Thư viện</h1>
      </main>
    </>
  );
}
