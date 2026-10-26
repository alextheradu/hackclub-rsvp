import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";
import { formatEventWhen } from "@/lib/format";
import { eventUrl, validateSlug } from "@/lib/slug";
import styles from "./page.module.css";

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
    title: `${event.title} · hackclub.rsvp`,
    description,
    alternates: { canonical: eventUrl(event) },
    openGraph: { title: event.title, description, url: eventUrl(event), type: "website" },
  };
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) notFound();

  const isIrl = event.kind === "irl";

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <div className={styles.meta}>
          <span className={`${styles.chip} ${isIrl ? styles.irl : styles.ysws}`}>
            {isIrl ? "IRL" : "YSWS"}
          </span>
          <span className={styles.org}>{event.orgName}</span>
        </div>

        <h1 className={styles.title}>{event.title}</h1>

        {event.cancelled && (
          <p className={styles.cancelled} role="status">
            This event was cancelled.
          </p>
        )}

        <dl className={styles.facts}>
          <div>
            <dt>When</dt>
            <dd className={styles.mono}>
              {formatEventWhen(event.startsAt, event.endsAt, event.timezone)}
            </dd>
          </div>
          {event.locationDisplay && (
            <div>
              <dt>Where</dt>
              <dd>{event.locationDisplay}</dd>
            </div>
          )}
          {event.onlineUrl && (
            <div>
              <dt>Online</dt>
              <dd>
                <a href={event.onlineUrl} rel="noopener noreferrer nofollow" target="_blank">
                  {new URL(event.onlineUrl).host}
                </a>
              </dd>
            </div>
          )}
          {event.website && (
            <div>
              <dt>Program</dt>
              <dd>
                <a href={event.website} rel="noopener noreferrer nofollow" target="_blank">
                  {new URL(event.website).host}
                </a>
              </dd>
            </div>
          )}
          {event.capacity && (
            <div>
              <dt>Spots</dt>
              <dd className={styles.mono}>{event.capacity}</dd>
            </div>
          )}
        </dl>

        {event.description && <p className={styles.description}>{event.description}</p>}

        {!event.cancelled && <p className={styles.soon}>RSVPs are not open yet.</p>}
      </article>
    </main>
  );
}
