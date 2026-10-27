import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { rootDomain } from "@/lib/domain";
import { listOrgsForUser } from "@/lib/events";
import { TopBar } from "../../_components/TopBar";
import styles from "../../page.module.css";
import { NewEventForm } from "./NewEventForm";

async function NewEventContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?returnTo=/dashboard/events/new");
  }
  const orgs = await listOrgsForUser(user.id);

  return (
    <>
      <TopBar user={user} />
      <main className={styles.column}>
        <div className={styles.heading}>
          <div>
            <h1 className={styles.title}>New event</h1>
            <p className={styles.sub}>Pick a kind, name it, and share the link.</p>
          </div>
        </div>
        <NewEventForm orgs={orgs} root={rootDomain()} />
      </main>
    </>
  );
}

export default function NewEventPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<TopBar />}>
        <NewEventContent />
      </Suspense>
    </div>
  );
}
