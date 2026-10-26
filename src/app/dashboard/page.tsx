import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { listEventsForUser, type EventSummary } from "@/lib/events";
import { eventUrl } from "@/lib/slug";
import buttons from "@/components/buttons.module.css";
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

function TopBar({ user }: { user?: CurrentUser }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarInner}>
        <nav className={styles.nav} aria-label="Main">
        </nav>
        {user && (
          <div className={styles.account}>
            <span className={styles.accountName}>{user.name || user.email}</span>
            <form method="POST" action="/logout">
              <button type="submit" className={`${buttons.btn} ${buttons.ghost}`}>
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}

function EventRow({ event }: { event: EventSummary }) {
  return (
    <li>
      <a className={styles.row} href={eventUrl(event)}>
        <div className={styles.rowMain}>
          <span className={styles.rowTitle}>{event.title}</span>
          <span className={styles.rowMeta}>
            {event.orgName} · <span className={styles.mono}>{formatStart(event)}</span>
          </span>
        </div>
        <div className={styles.rowSide}>
          {event.cancelled && <span className={`${styles.chip} ${styles.cancelled}`}>Cancelled</span>}
          <span className={`${styles.chip} ${event.kind === "irl" ? styles.irl : styles.ysws}`}>
            {event.kind === "irl" ? "IRL" : "YSWS"}
          </span>
          <span className={styles.arrow} aria-hidden="true">
            ↗
          </span>
        </div>
      </a>
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
          <a className={`${buttons.btn} ${buttons.primary}`} href="/dashboard/events/new">
            New event
          </a>
        </div>

        {events.length === 0 ? (
          <div className={styles.empty}>
            <p>Create an event, share the link, and RSVPs will show up here.</p>
            <a className={`${buttons.btn} ${buttons.primary}`} href="/dashboard/events/new">
              Create your first event
            </a>
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
