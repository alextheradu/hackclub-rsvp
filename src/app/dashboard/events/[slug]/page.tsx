import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEventBySlug } from "@/lib/events";
import { getRoster } from "@/lib/roster";
import { validateSlug } from "@/lib/slug";
import { TopBar } from "../../_components/TopBar";

type Params = PageProps<"/dashboard/events/[slug]">["params"];

async function RosterContent({ params }: { params: Params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=/dashboard/events/${slug}`);

  const event = validateSlug(slug).ok ? await getEventBySlug(slug) : null;
  if (!event) notFound();

  const roster = await getRoster(user.id, event.id);
  if (!roster) notFound();

  return (
    <>
      <TopBar user={user} />
      <main>
        <h1>{event.title}</h1>
        <ul>
          {roster.map((entry) => (
            <li key={entry.rsvpId}>
              {entry.name ?? entry.email} · {entry.status}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

export default function RosterPage({ params }: PageProps<"/dashboard/events/[slug]">) {
  return (
    <Suspense fallback={<TopBar />}>
      <RosterContent params={params} />
    </Suspense>
  );
}
