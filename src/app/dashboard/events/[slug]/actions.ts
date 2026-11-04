"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { cancelEvent, getEventBySlug } from "@/lib/events";
import { validateSlug } from "@/lib/slug";

export type CancelEventState = { error: string | null };

export async function cancelEventAction(
  slug: string,
  _prev: CancelEventState,
): Promise<CancelEventState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=/dashboard/events/${slug}`);

  const event = validateSlug(slug).ok ? await getEventBySlug(slug) : null;
  if (!event) return { error: "Event not found." };

  const result = await cancelEvent(user.id, event.id);
  if (result === "not_member") return { error: "You can't cancel an event you don't organize." };

  revalidatePath(`/dashboard/events/${slug}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath(`/e/${slug}`);
  return { error: null };
}
