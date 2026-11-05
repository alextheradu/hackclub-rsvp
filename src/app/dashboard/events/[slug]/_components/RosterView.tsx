import Image from "next/image";
import Link from "next/link";
import type { PublicEvent } from "@/lib/events";
import type { RosterCounts, RosterEntry } from "@/lib/roster";
import { rosterHref, type RosterFilter, type RosterStatus } from "@/lib/roster-filter";
import buttons from "@/components/buttons.module.css";
import { Chip, type ChipTone } from "@/components/Chip";
import dash from "../../../page.module.css";
import styles from "../roster.module.css";
import { RosterSearch } from "./RosterSearch";

const STATUS_LABEL: Record<RosterStatus, string> = {
  confirmed: "Going",
  waitlisted: "Waitlist",
  cancelled: "Cancelled",
};

const EMPTY_STATUS: Record<RosterStatus, string> = {
  confirmed: "Nobody going yet.",
  waitlisted: "Nobody on the waitlist.",
  cancelled: "No cancelled RSVPs.",
};

const STATUS_TONE: Record<RosterStatus, ChipTone> = {
  confirmed: "green",
  waitlisted: "yellow",
  cancelled: "neutral",
};

function formatDate(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}

function Avatar({ entry }: { entry: RosterEntry }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {entry.avatarUrl ? (
        <Image src={entry.avatarUrl} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer" />
      ) : (
        (entry.name ?? entry.email).trim().charAt(0).toUpperCase() || "?"
      )}
    </span>
  );
}

function RosterRow({ entry, timeZone }: { entry: RosterEntry; timeZone: string }) {
  return (
    <li className={styles.row} data-status={entry.status}>
      <Avatar entry={entry} />
      <div className={styles.person}>
        <span className={styles.name}>{entry.name ?? entry.email}</span>
        {entry.name && <span className={styles.email}>{entry.email}</span>}
      </div>
      <span className={styles.slack}>
        {entry.slackId && <span className="sr-only">Slack ID </span>}
        {entry.slackId}
      </span>
      <span className={styles.status}>
        <Chip tone={STATUS_TONE[entry.status]} tilt={false}>
          {STATUS_LABEL[entry.status]}
        </Chip>
      </span>
      <time
        className={styles.date}
        dateTime={entry.rsvpedAt.toISOString()}
        title={`RSVPed ${formatDate(entry.rsvpedAt, timeZone, { dateStyle: "medium", timeStyle: "short" })}`}
      >
        {formatDate(entry.rsvpedAt, timeZone, { month: "short", day: "numeric" })}
      </time>
    </li>
  );
}

export function RosterSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={styles.toolbar}>
        <span className={`${dash.skeleton} ${styles.skeletonInput}`} />
        <span className={`${dash.skeleton} ${styles.skeletonButton}`} />
      </div>
      <div className={styles.statusFilter}>
        <span className={`${dash.skeleton} ${styles.skeletonTabs}`} />
      </div>
      <ul className={dash.list}>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className={styles.skeletonRow}>
            <span className={`${dash.skeleton} ${styles.avatar}`} />
            <span className={styles.person}>
              <span className={`${dash.skeleton} ${dash.skeletonLine}`} />
              <span className={`${dash.skeleton} ${dash.skeletonLineShort}`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  event: PublicEvent;
  filter: RosterFilter;
  roster: RosterEntry[];
  counts: RosterCounts;
};

export function RosterView({ event, filter, roster, counts }: Props) {
  const base = `/dashboard/events/${event.slug}/roster`;
  const statuses: RosterStatus[] = ["confirmed", "waitlisted"];
  if (counts.cancelled > 0 || filter.status === "cancelled") statuses.push("cancelled");

  return (
    <>
      <RosterSearch
        base={base}
        status={filter.status}
        q={filter.q ?? ""}
        tabs={[
          { label: "All", count: counts.all },
          ...statuses.map((status) => ({ status, label: STATUS_LABEL[status], count: counts[status] })),
        ]}
      >
        <a className={buttons.btn} href={`/dashboard/events/${event.slug}/roster.csv`} download>
          Export CSV
        </a>
      </RosterSearch>

      {roster.length === 0 ? (
        <p className={styles.emptyRoster}>
          {filter.q ? (
            <>
              Nobody matches “{filter.q}”.{" "}
              <Link href={rosterHref(base, { status: filter.status })}>Clear search</Link>
            </>
          ) : filter.status ? (
            EMPTY_STATUS[filter.status]
          ) : (
            "No RSVPs yet. Share the event link to get some."
          )}
        </p>
      ) : (
        <ul className={dash.list}>
          {roster.map((entry) => (
            <RosterRow key={entry.rsvpId} entry={entry} timeZone={event.timezone} />
          ))}
        </ul>
      )}
    </>
  );
}
