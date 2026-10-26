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
          <div className={styles.action}>
            {event.capacity && <p className={styles.spots}>{event.capacity} spots</p>}
            <p className={styles.soon}>RSVPs are not open yet.</p>
          </div>
        )}
      </article>
    </main>
  );
}
