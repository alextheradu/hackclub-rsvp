import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEventBySlug } from "@/lib/events";
import { getRoster, type RosterEntry } from "@/lib/roster";
import { getRsvpSummary } from "@/lib/rsvps";
import { parseRosterFilter, ROSTER_STATUSES, type RosterStatus } from "@/lib/roster-filter";
import { validateSlug } from "@/lib/slug";
import buttons from "@/components/buttons.module.css";
import { TopBar } from "../../_components/TopBar";
import dash from "../../page.module.css";
import { CancelEventButton } from "./CancelEventButton";
import styles from "./roster.module.css";

type Props = PageProps<"/dashboard/events/[slug]">;

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

async function RosterContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const filter = parseRosterFilter(await searchParams);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=/dashboard/events/${slug}`);

  const event = validateSlug(slug).ok ? await getEventBySlug(slug) : null;
  if (!event) notFound();

  const roster = await getRoster(user.id, event.id, filter);
  if (!roster) notFound();
  const summary = event.cancelled ? null : await getRsvpSummary(event.id, null);

  const filtering = Boolean(filter.status || filter.q);
  const count = `${roster.length} ${roster.length === 1 ? "RSVP" : "RSVPs"}`;

  return (
    <>
      <TopBar user={user} />
      <main className={dash.column}>
        <div className={`${dash.heading} ${styles.heading}`}>
          <div>
            <h1 className={dash.title}>{event.title}</h1>
            <p className={dash.sub}>{filtering ? `${count} match` : count}</p>
          </div>
          <div className={styles.actions}>
            <a
              className={buttons.btn}
              href={`/dashboard/events/${event.slug}/roster.csv`}
              download
            >
              Export CSV
            </a>
            {summary && (
              <CancelEventButton
                slug={event.slug}
                notifyCount={summary.confirmedCount + summary.waitlistedCount}
              />
            )}
          </div>
        </div>

        {event.cancelled && (
          <p className={styles.notice} role="status">
            This event is cancelled. RSVPs are closed and everyone who was going or waitlisted
            was emailed.
          </p>
        )}

        <form className={styles.filters} role="search">
          <label className={styles.search}>
            <span className={styles.srOnly}>Search</span>
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
            <span className={styles.srOnly}>Status</span>
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
            <Link className={styles.clear} href={`/dashboard/events/${event.slug}`}>
              Clear
            </Link>
          )}
        </form>

        {roster.length === 0 ? (
          <p className={dash.empty}>
            {filtering ? "No RSVPs match." : "No RSVPs yet. Share the event link to get some."}
          </p>
        ) : (
          <ul className={dash.list}>
            {roster.map((entry) => (
              <RosterRow key={entry.rsvpId} entry={entry} timeZone={event.timezone} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function RosterPage({ params, searchParams }: Props) {
  return (
    <div className={dash.page}>
      <Suspense fallback={<TopBar />}>
        <RosterContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
