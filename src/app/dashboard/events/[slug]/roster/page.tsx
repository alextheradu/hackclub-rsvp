import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoster, type RosterEntry } from "@/lib/roster";
import { parseRosterFilter, ROSTER_STATUSES, type RosterStatus } from "@/lib/roster-filter";
import buttons from "@/components/buttons.module.css";
import dash from "../../../page.module.css";
import { getManagedEvent } from "../data";
import styles from "../roster.module.css";

type Props = PageProps<"/dashboard/events/[slug]/roster">;

const STATUS_LABEL: Record<RosterStatus, string> = {
  confirmed: "Going",
  waitlisted: "Waitlist",
  cancelled: "Cancelled",
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

async function Roster({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const filter = parseRosterFilter(await searchParams);
  const { user, event } = await getManagedEvent(slug);

  const roster = await getRoster(user.id, event.id, filter);
  if (!roster) notFound();

  const filtering = Boolean(filter.status || filter.q);
  const count = `${roster.length} ${roster.length === 1 ? "RSVP" : "RSVPs"}`;

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.total}>{filtering ? `${count} match` : count}</p>
        <a className={buttons.btn} href={`/dashboard/events/${event.slug}/roster.csv`} download>
          Export CSV
        </a>
      </div>

      <form className={styles.filters} role="search">
        <label className={styles.search}>
          <span className="sr-only">Search</span>
          <input
            className={styles.input}
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="Name, email or Slack ID"
            maxLength={100}
            autoComplete="off"
          />
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select className={styles.input} name="status" defaultValue={filter.status ?? ""}>
            <option value="">All statuses</option>
            {ROSTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <button className={buttons.btn} type="submit">
          Filter
        </button>
        {filtering && (
          <Link className={styles.clear} href={`/dashboard/events/${event.slug}/roster`}>
            Clear
          </Link>
        )}
      </form>

      {roster.length === 0 ? (
        <p className={styles.emptyRoster}>
          {filtering ? "No RSVPs match." : "No RSVPs yet. Share the event link to get some."}
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

export default function RosterPage({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Roster params={params} searchParams={searchParams} />
    </Suspense>
  );
}
