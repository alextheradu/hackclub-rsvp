import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listEventsForUser, type EventSummary } from "@/lib/events";
import buttons from "@/components/buttons.module.css";
import { TopBar } from "./_components/TopBar";
import styles from "./page.module.css";

function formatStart(event: EventSummary): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: event.timezone }).format(
      event.startsAt,
    );
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
      event.startsAt,
    );
  }
}

function EventRow({ event }: { event: EventSummary }) {
  return (
    <li>
      <Link className={styles.row} href={`/dashboard/events/${event.slug}`}>
        <div className={styles.rowMain}>
          <span className={styles.rowTitle}>{event.title}</span>
          <span className={styles.rowMeta}>
            {event.orgName} · {formatStart(event)}
          </span>
        </div>
        <div className={styles.rowSide}>
          <span className={event.cancelled ? styles.cancelled : undefined}>
            {event.cancelled ? "Cancelled" : event.kind === "irl" ? "In person" : "Online"}
          </span>
          <span className={styles.arrow} aria-hidden="true">
            ›
          </span>
        </div>
      </Link>
    </li>
  );
}

async function DashboardContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?returnTo=/dashboard");
  }
  const events = await listEventsForUser(user.id);

  return (
    <>
      <TopBar user={user} />
      <main className={styles.column}>
        <div className={styles.heading}>
          <div>
            <h1 className={styles.title}>Your events</h1>
            <p className={styles.sub}>
              {events.length === 0
                ? "Nothing here yet."
                : `${events.length} ${events.length === 1 ? "event" : "events"} across your orgs.`}
            </p>
          </div>
          <Link className={`${buttons.btn} ${buttons.primary}`} href="/dashboard/events/new">
            New event
          </Link>
        </div>

        {events.length === 0 ? (
          <div className={styles.empty}>
            <p>Create an event, share the link, and RSVPs will show up here.</p>
            <Link className={`${buttons.btn} ${buttons.primary}`} href="/dashboard/events/new">
              Create your first event
            </Link>
          </div>
        ) : (
          <ul className={styles.list}>
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<TopBar />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
