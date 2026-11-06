import { Suspense } from "react";
import { toLocalDateTime } from "@/lib/datetime";
import { getRecentRsvps, getRsvpDays } from "@/lib/roster";
import { buildTimeline } from "@/lib/rsvp-timeline";
import { OverviewSkeleton, OverviewView } from "./_components/OverviewView";
import { getEventCounts, getManagedEvent } from "./data";

type Props = PageProps<"/dashboard/events/[slug]">;

async function Overview({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const { user, event } = await getManagedEvent(slug);
  const [counts, recent, days] = await Promise.all([
    getEventCounts(event.id),
    getRecentRsvps(user.id, event.id, 5),
    getRsvpDays(user.id, event.id),
  ]);

  // From the first RSVP to today, or to the event's last day once it's over.
  const now = new Date();
  const today = toLocalDateTime(now, event.timezone).slice(0, 10);
  const lastDay = toLocalDateTime(event.endsAt ?? event.startsAt, event.timezone).slice(0, 10);
  const timeline = days.length > 0 ? buildTimeline(days, days[0].day, today < lastDay ? today : lastDay) : [];

  return (
    <OverviewView
      event={event}
      counts={counts}
      recent={recent}
      timeline={timeline}
      now={now}
    />
  );
}

export default function OverviewPage({ params }: Props) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}
