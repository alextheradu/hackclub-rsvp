import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { parseEventTab } from "@/lib/event-list";
import { listEventsForUser } from "@/lib/events";
import buttons from "@/components/buttons.module.css";
import { EventListSkeleton, EventListView } from "./_components/EventList";
import { TopBar } from "./_components/TopBar";
import styles from "./page.module.css";

async function EventList({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/dashboard");

  const [events, params] = await Promise.all([listEventsForUser(user.id), searchParams]);
  return <EventListView events={events} tab={parseEventTab(params.show)} now={new Date()} />;
}

async function DashboardTopBar() {
  const user = await getCurrentUser();
  return <TopBar user={user ?? undefined} crumbs={[{ label: "Events" }]} />;
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<TopBar crumbs={[{ label: "Events" }]} />}>
        <DashboardTopBar />
      </Suspense>
      <main className={styles.column}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Your events</h1>
          <Link className={`${buttons.btn} ${buttons.primary}`} href="/dashboard/events/new">
            New event
          </Link>
        </div>
        <Suspense fallback={<EventListSkeleton />}>
          <EventList searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
