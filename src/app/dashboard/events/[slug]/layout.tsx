import type { Metadata } from "next";
import { Suspense } from "react";
import dash from "../../page.module.css";
import {
  EventHeaderSkeleton,
  EventHeaderView,
} from "./_components/EventHeaderView";
import { getEventCounts, getManagedEvent } from "./data";
import styles from "./layout.module.css";

type Props = LayoutProps<"/dashboard/events/[slug]">;

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const { event } = await getManagedEvent(slug);
  return {
    title: {
      default: `${event.title} · hackclub.rsvp`,
      template: `%s · ${event.title}`,
    },
  };
}

async function EventHeader({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const { user, event } = await getManagedEvent(slug);
  const counts = await getEventCounts(event.id);
  return (
    <EventHeaderView
      user={user}
      event={event}
      rsvpCount={counts.confirmedCount + counts.waitlistedCount}
      now={new Date()}
    />
  );
}

export default function EventLayout({ params, children }: Props) {
  return (
    <div className={dash.page}>
      <Suspense fallback={<EventHeaderSkeleton />}>
        <EventHeader params={params} />
      </Suspense>
      <main id="main" className={styles.body}>
        {children}
      </main>
    </div>
  );
}
