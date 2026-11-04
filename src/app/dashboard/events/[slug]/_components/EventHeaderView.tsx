import { isLive } from "@/lib/event-list";
import type { PublicEvent } from "@/lib/events";
import { formatEventWhen } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth";
import { Chip } from "@/components/Chip";
import { Tabs } from "@/components/Tabs";
import { TopBar } from "../../../_components/TopBar";
import styles from "../layout.module.css";

type Props = {
  user: CurrentUser;
  event: PublicEvent;
  rsvpCount: number;
  now: Date;
};

export function EventHeaderView({ user, event, rsvpCount, now }: Props) {
  const live = isLive(event, now);
  const ended = !event.cancelled && !live && (event.endsAt ?? event.startsAt) < now;
  const base = `/dashboard/events/${event.slug}`;

  return (
    <>
      <TopBar user={user} crumbs={[{ label: "Events", href: "/dashboard" }, { label: event.title }]} />
      <div className={styles.head}>
        <div className={styles.titleLine}>
          <h1 className={styles.title}>{event.title}</h1>
          {event.cancelled && <Chip tone="red">Cancelled</Chip>}
          {live && <Chip tone="green">Live now</Chip>}
          {ended && <Chip>Ended</Chip>}
        </div>
        <p className={styles.meta}>
          <span>{formatEventWhen(event.startsAt, event.endsAt, event.timezone)}</span>
          <span className={styles.metaRest}>
            {event.kind === "irl" ? "In person" : "YSWS"}
            <span className={styles.dot} aria-hidden="true" />
            {event.orgName}
          </span>
        </p>
        <Tabs
          label="Event sections"
          items={[
            { href: base, label: "Overview", exact: true },
            { href: `${base}/roster`, label: "Roster", count: rsvpCount },
            { href: `${base}/settings`, label: "Settings" },
          ]}
        />
      </div>
    </>
  );
}

export function EventHeaderSkeleton() {
  return (
    <>
      <TopBar crumbs={[{ label: "Events", href: "/dashboard" }]} />
      <div className={styles.head} aria-busy="true">
        <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <span className={`${styles.skeleton} ${styles.skeletonMeta}`} />
        <div className={styles.skeletonTabs} />
      </div>
    </>
  );
}
