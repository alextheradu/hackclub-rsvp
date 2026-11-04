import Link from "next/link";
import { capacityTone } from "@/lib/event-list";
import type { PublicEvent } from "@/lib/events";
import { formatEventWhen, timeAgo } from "@/lib/format";
import type { RosterEntry } from "@/lib/roster";
import type { RsvpSummary } from "@/lib/rsvps";
import { eventUrl } from "@/lib/slug";
import { Chip } from "@/components/Chip";
import { ShareLink } from "../ShareLink";
import styles from "../overview.module.css";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

type Props = {
  event: PublicEvent;
  counts: Pick<RsvpSummary, "confirmedCount" | "waitlistedCount">;
  recent: RosterEntry[];
  now: Date;
};

export function OverviewView({ event, counts, recent, now }: Props) {
  const going = counts.confirmedCount;
  const total = going + counts.waitlistedCount;
  const left =
    event.capacity === null ? null : Math.max(event.capacity - going, 0);
  const rosterHref = `/dashboard/events/${event.slug}/roster`;

  return (
    <div className={styles.overview}>
      {event.cancelled ? (
        <p className={styles.notice} role="status">
          This event is cancelled. RSVPs are closed and everyone who was going
          or waitlisted was emailed.
        </p>
      ) : (
        <section
          className={styles.shareSection}
          aria-labelledby="share-heading"
        >
          <h2 id="share-heading" className={styles.label}>
            Public page
          </h2>
          <ShareLink url={eventUrl(event)} />
        </section>
      )}

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="rsvps-heading">
          <h2 id="rsvps-heading" className={styles.label}>
            RSVPs
          </h2>
          <p className={styles.going}>
            <span className={styles.goingNum}>{going}</span>
            <span className={styles.goingText}>
              going{event.capacity !== null && <> of {event.capacity}</>}
            </span>
          </p>
          {event.capacity !== null && (
            <span
              className={styles.bar}
              data-tone={capacityTone(going, event.capacity)}
              role="meter"
              aria-label="Seats taken"
              aria-valuemin={0}
              aria-valuemax={event.capacity}
              aria-valuenow={going}
            >
              <span
                style={{
                  transform: `scaleX(${Math.min(going / event.capacity, 1)})`,
                }}
              />
            </span>
          )}
          {!event.cancelled && (
            <p className={styles.goingSub}>
              {left === null
                ? "No limit"
                : left === 0
                  ? "Full"
                  : `${plural(left, "spot", "spots")} left`}
              {counts.waitlistedCount > 0 && (
                <>
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.waitlist}>
                    {counts.waitlistedCount} on the waitlist
                  </span>
                </>
              )}
            </p>
          )}

          <div className={styles.recent}>
            <h3 className={styles.recentHeading}>Latest</h3>
            {recent.length === 0 ? (
              <p className={styles.recentEmpty}>
                {event.cancelled
                  ? "Nobody RSVPed."
                  : "No RSVPs yet. Share the link to get some."}
              </p>
            ) : (
              <ul className={styles.recentList}>
                {recent.map((entry) => (
                  <li key={entry.rsvpId} className={styles.recentRow}>
                    <span className={styles.recentName}>
                      {entry.name ?? entry.email}
                    </span>
                    {entry.status === "waitlisted" && (
                      <Chip tone="yellow" tilt={false}>
                        Waitlist
                      </Chip>
                    )}
                    <time
                      className={styles.recentTime}
                      dateTime={entry.rsvpedAt.toISOString()}
                    >
                      {timeAgo(entry.rsvpedAt, now, event.timezone)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            {total > 0 && (
              <Link className={styles.more} href={rosterHref}>
                See all {plural(total, "RSVP", "RSVPs")}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </section>

        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className={styles.label}>
            Details
          </h2>
          <dl className={styles.details}>
            <div>
              <dt>When</dt>
              <dd>
                {formatEventWhen(event.startsAt, event.endsAt, event.timezone)}
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {event.locationDisplay ??
                  (event.onlineUrl ? (
                    <a
                      href={event.onlineUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {event.onlineUrl.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    <span className={styles.unset}>
                      {event.kind === "irl" ? "Not set" : "Online"}
                    </span>
                  ))}
              </dd>
            </div>
            <div>
              <dt>Capacity</dt>
              <dd>
                {event.capacity === null ? (
                  <span className={styles.unset}>No limit</span>
                ) : (
                  event.capacity
                )}
              </dd>
            </div>
            <div>
              <dt>Website</dt>
              <dd>
                {event.website ? (
                  <a
                    href={event.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {event.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  <span className={styles.unset}>None</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Org</dt>
              <dd>{event.orgName}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div
      className={styles.overview}
      aria-busy="true"
      aria-label="Loading overview"
    >
      <span className={`${styles.skeleton} ${styles.skeletonShare}`} />
      <div className={styles.grid}>
        <span className={`${styles.skeleton} ${styles.skeletonPanel}`} />
        <span className={`${styles.skeleton} ${styles.skeletonPanel}`} />
      </div>
    </div>
  );
}
