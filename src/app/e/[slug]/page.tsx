import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { rootDomain } from "@/lib/domain";
import { getEventBySlug } from "@/lib/events";
import { formatEventWhen } from "@/lib/format";
import { rsvpButtonState } from "@/lib/rsvp-state";
import { getRsvpSummary } from "@/lib/rsvps";
import { eventUrl, validateSlug } from "@/lib/slug";
import styles from "./page.module.css";
import { RsvpAction } from "./RsvpAction";

export const instant = false;

const loadEvent = cache(async (slug: string) => {
  if (!validateSlug(slug).ok) return null;
  return getEventBySlug(slug);
});

export async function generateMetadata({
  params,
}: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) return { title: "Event not found" };
  const when = formatEventWhen(event.startsAt, event.endsAt, event.timezone);
  const description = event.description?.slice(0, 200) || `${event.orgName} · ${when}`;
  return {
    title: `${event.title} · ${rootDomain()}`,
    description,
    alternates: { canonical: eventUrl(event, rootDomain()) },
    openGraph: { title: event.title, description, url: eventUrl(event, rootDomain()), type: "website" },
  };
}

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

async function RsvpSection({ event, slug }: { event: LoadedEvent; slug: string }) {
  const user = await getCurrentUser();
  const summary = await getRsvpSummary(event.id, user?.id ?? null);
  const state = rsvpButtonState({
    cancelled: event.cancelled,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity: event.capacity,
    confirmedCount: summary.confirmedCount,
    myStatus: summary.myStatus,
    signedIn: user !== null,
    now: new Date(),
  });
  return (
    <RsvpAction
      slug={slug}
      state={state}
      capacity={event.capacity}
      confirmedCount={summary.confirmedCount}
      waitlistedCount={summary.waitlistedCount}
    />
  );
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) notFound();

  const isIrl = event.kind === "irl";
  const [date, time] = formatEventWhen(event.startsAt, event.endsAt, event.timezone).split(" · ");

  return (
    <main className={styles.page}>
      <article className={styles.event}>
        <p className={styles.eyebrow}>
          {event.orgName} · {isIrl ? "In person" : "Online program"}
        </p>

        <h1 className={styles.title}>{event.title}</h1>

        {event.cancelled && (
          <p className={styles.cancelled} role="status">
            This event was cancelled.
          </p>
        )}

        <div className={styles.when}>
          <p className={styles.date}>{date}</p>
          {time && <p className={styles.time}>{time}</p>}
        </div>

        {(event.locationDisplay || event.onlineUrl || event.website) && (
          <div className={styles.details}>
            {event.locationDisplay && <p>{event.locationDisplay}</p>}
            {event.onlineUrl && (
              <a href={event.onlineUrl} rel="noopener noreferrer nofollow" target="_blank">
                {new URL(event.onlineUrl).host}
              </a>
            )}
            {event.website && (
              <a href={event.website} rel="noopener noreferrer nofollow" target="_blank">
                {new URL(event.website).host}
              </a>
            )}
          </div>
        )}

        {event.description && <p className={styles.description}>{event.description}</p>}

        {!event.cancelled && (
          <Suspense fallback={<div className={styles.action} />}>
            <RsvpSection event={event} slug={slug} />
          </Suspense>
        )}
      </article>
    </main>
  );
}
