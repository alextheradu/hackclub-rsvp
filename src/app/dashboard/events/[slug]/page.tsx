import { Suspense } from "react";
import { getRecentRsvps } from "@/lib/roster";
import { OverviewSkeleton, OverviewView } from "./_components/OverviewView";
import { getEventCounts, getManagedEvent } from "./data";

type Props = PageProps<"/dashboard/events/[slug]">;

async function Overview({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const { user, event } = await getManagedEvent(slug);
  const [counts, recent] = await Promise.all([
    getEventCounts(event.id),
    getRecentRsvps(user.id, event.id, 5),
  ]);
  return (
    <OverviewView
      event={event}
      counts={counts}
      recent={recent}
      now={new Date()}
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
