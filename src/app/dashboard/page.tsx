import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

async function DashboardContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?returnTo=/dashboard");
  }
  return (
    <>
      <p>Signed in as {user.name || user.email}</p>
      <form method="POST" action="/logout">
        <button type="submit">Logout</button>
      </form>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main>
      <Suspense fallback={<p>Loading…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
