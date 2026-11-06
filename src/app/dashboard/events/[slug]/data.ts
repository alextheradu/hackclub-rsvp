import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManageEvent, getEventBySlug } from "@/lib/events";
import { getRsvpSummary } from "@/lib/rsvps";
import { validateSlug } from "@/lib/slug";

export const getManagedEvent = cache(async (slug: string) => {
  if (!validateSlug(slug).ok) notFound();
  const user = await getCurrentUser();
  if (!user)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/dashboard/events/${slug}`)}`,
    );

  const event = await getEventBySlug(slug);
  if (!event || !(await canManageEvent(user.id, event.id))) notFound();
  return { user, event };
});

export const getEventCounts = cache((eventId: number) =>
  getRsvpSummary(eventId, null),
);
