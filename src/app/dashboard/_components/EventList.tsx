import Link from "next/link";
import {
  capacityTone,
  groupEvents,
  isLive,
  type EventTab,
} from "@/lib/event-list";
import type { EventSummary } from "@/lib/events";
import { dateTile } from "@/lib/format";
import buttons from "@/components/buttons.module.css";
import { Chip } from "@/components/Chip";
import { Segmented } from "@/components/Segmented";
import styles from "../page.module.css";

const TAB_HREF: Record<EventTab, string> = {
  upcoming: "/dashboard",
  past: "/dashboard?show=past",
  cancelled: "/dashboard?show=cancelled",
};

const EMPTY_TAB: Record<EventTab, string> = {
  upcoming: "Nothing coming up.",
  past: "No past events yet.",
  cancelled: "Nothing cancelled.",
};

function Capacity({ event, tab }: { event: EventSummary; tab: EventTab }) {
  const { confirmedCount: going, capacity, waitlistedCount } = event;
  const tone = capacityTone(going, capacity);
  const fill = capacity ? Math.min(going / capacity, 1) : 0;
  const label = tab === "upcoming" ? "going" : "RSVPs";

  return (
    <div className={styles.capacity}>
      <span className={styles.count}>
        <span className={styles.countNum}>{going}</span>
        {capacity !== null && (
          <span className={styles.countMax}>/{capacity}</span>
        )}
        <span className={styles.countLabel}> {label}</span>
      </span>
      {capacity !== null && (
        <span
          className={styles.bar}
          data-tone={tone}
          role="meter"
          aria-label="Seats taken"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={going}
        >
          <span style={{ transform: `scaleX(${fill})` }} />
        </span>
      )}
      {waitlistedCount > 0 && (
        <span className={styles.waitlist}>+{waitlistedCount} waitlisted</span>
      )}
    </div>
  );
}

function EventRow({
  event,
  tab,
  now,
}: {
  event: EventSummary;
  tab: EventTab;
  now: Date;
}) {
  const when = dateTile(event.startsAt, event.timezone);
  const showYear = when.year !== String(now.getUTCFullYear());
  const live = isLive(event, now);

  return (
    <li>
      <Link
        className={styles.row}
        href={`/dashboard/events/${event.slug}`}
        data-cancelled={event.cancelled || undefined}
      >
        <span className={styles.tile} aria-hidden="true">
          <span className={styles.tileMonth}>{when.month}</span>
          <span className={styles.tileDay}>{when.day}</span>
        </span>
        <span className={styles.rowMain}>
          <span className={styles.rowTitleLine}>
            <span className={styles.rowTitle}>{event.title}</span>
            {live && <Chip tone="green">Live now</Chip>}
          </span>
          <span className={styles.rowMeta}>
            <span className="sr-only">
              {when.month} {when.day},{" "}
            </span>
            <span>
              {when.weekday} {showYear && `${when.year} `}· {when.time}{" "}
              {when.zone}
            </span>
            <span className={styles.metaWhat}>
              {event.kind === "irl" ? "In person" : "YSWS"}
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.org}>{event.orgName}</span>
            </span>
          </span>
        </span>
        <Capacity event={event} tab={tab} />
        <span className={styles.arrow} aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}

export function EventListView({
  events,
  tab,
  now,
}: {
  events: EventSummary[];
  tab: EventTab;
  now: Date;
}) {
  const groups = groupEvents(events, now);
  const shown = groups[tab];

  if (events.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No events yet</p>
        <p>
          Create an event, share its link, and RSVPs show up here as they come
          in.
        </p>
        <Link
          className={`${buttons.btn} ${buttons.primary}`}
          href="/dashboard/events/new"
        >
          Create your first event
        </Link>
      </div>
    );
  }

  const tabs: EventTab[] =
    groups.cancelled.length > 0 || tab === "cancelled"
      ? ["upcoming", "past", "cancelled"]
      : ["upcoming", "past"];

  return (
    <>
      <div className={styles.toolbar}>
        <Segmented
          label="Filter events"
          value={tab}
          options={tabs.map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
            href: TAB_HREF[value],
            count: groups[value].length,
          }))}
        />
      </div>

      {shown.length === 0 ? (
        <p className={styles.emptyTab}>
          {EMPTY_TAB[tab]}
          {tab === "upcoming" && (
            <>
              {" "}
              <Link href="/dashboard/events/new">Create an event</Link>
            </>
          )}
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((event) => (
            <EventRow key={event.id} event={event} tab={tab} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}

export function EventListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading events">
      <div className={styles.toolbar}>
        <span className={`${styles.skeleton} ${styles.skeletonTabs}`} />
      </div>
      <ul className={styles.list}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={styles.skeletonRow}>
            <span className={`${styles.skeleton} ${styles.skeletonTile}`} />
            <span className={styles.rowMain}>
              <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
              <span
                className={`${styles.skeleton} ${styles.skeletonLineShort}`}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
