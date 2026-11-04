import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getRoster, getRosterCounts } from "@/lib/roster";
import { parseRosterFilter } from "@/lib/roster-filter";
import { RosterView } from "../_components/RosterView";
import { getManagedEvent } from "../data";

type Props = PageProps<"/dashboard/events/[slug]/roster">;

async function Roster({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const filter = parseRosterFilter(await searchParams);
  const { user, event } = await getManagedEvent(slug);

  const [roster, counts] = await Promise.all([
    getRoster(user.id, event.id, filter),
    getRosterCounts(user.id, event.id, filter.q),
  ]);
  if (!roster || !counts) notFound();

  return <RosterView event={event} filter={filter} roster={roster} counts={counts} />;
}

export default function RosterPage({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Roster params={params} searchParams={searchParams} />
    </Suspense>
  );
}
