import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?returnTo=/dashboard");
  }
  return (
    <main>
        <p>Signed in as {user.name || user.email}</p>
      <form method="POST" action="/logout">
        <button type="submit">Logout</button>
      </form>
    </main>
  );
}
