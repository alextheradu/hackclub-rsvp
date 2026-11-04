import Link from "next/link";
import type { PublicEvent } from "@/lib/events";
import type { RosterCounts, RosterEntry } from "@/lib/roster";
import { rosterHref, type RosterFilter, type RosterStatus } from "@/lib/roster-filter";
import buttons from "@/components/buttons.module.css";
import { Segmented } from "@/components/Segmented";
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

function formatRsvpedAt(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}

function RosterRow({ entry, timeZone }: { entry: RosterEntry; timeZone: string }) {
  const meta = [entry.name ? entry.email : null, entry.slackId].filter(Boolean).join(" · ");
  return (
    <li className={styles.row}>
      <div className={dash.rowMain}>
        <span className={dash.rowTitle}>{entry.name ?? entry.email}</span>
        {meta && <span className={dash.rowMeta}>{meta}</span>}
      </div>
      <div className={styles.rowSide}>
        <span className={styles[entry.status]}>{STATUS_LABEL[entry.status]}</span>
        <span className={styles.date}>{formatRsvpedAt(entry.rsvpedAt, timeZone)}</span>
      </div>
    </li>
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
      <div className={styles.toolbar}>
        <RosterSearch base={base} status={filter.status} q={filter.q ?? ""} />
        <a className={buttons.btn} href={`/dashboard/events/${event.slug}/roster.csv`} download>
          Export CSV
        </a>
      </div>

      <div className={styles.statusFilter}>
        <Segmented
          label="Filter by status"
          value={filter.status ?? "all"}
          options={[
            { value: "all", label: "All", href: rosterHref(base, { q: filter.q }), count: counts.all },
            ...statuses.map((status) => ({
              value: status,
              label: STATUS_LABEL[status],
              href: rosterHref(base, { status, q: filter.q }),
              count: counts[status],
            })),
          ]}
        />
      </div>

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
