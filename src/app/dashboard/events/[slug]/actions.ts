"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { parseEventChanges } from "@/lib/event-form";
import {
  cancelEvent,
  getEventBySlug,
  updateEvent,
  type UpdateEventResult,
} from "@/lib/events";
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
  if (result === "not_member")
    return { error: "You can't cancel an event you don't organize." };

  revalidatePath(`/dashboard/events/${slug}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath(`/e/${slug}`);
  return { error: null };
}

export type UpdateEventState = {
  error: string | null;
  field?: string;
  saved: string | null;
};

const UPDATE_ERROR_FIELD: Partial<
  Record<Extract<UpdateEventResult, { ok: false }>["reason"], string>
> = {
  title: "title",
  dates: "endsLocal",
  capacity: "capacity",
};

function updateError(
  result: Extract<UpdateEventResult, { ok: false }>,
): string {
  switch (result.reason) {
    case "title":
      return "Give the event a title.";
    case "dates":
      return "The event has to end after it starts.";
    case "not_member":
      return "You can't edit an event you don't organize.";
    case "cancelled":
      return "Cancelled events can't be edited.";
    case "capacity":
      return `${result.confirmedCount} people are already going, so capacity can't be lower than ${result.confirmedCount}.`;
  }
}

export async function updateEventAction(
  slug: string,
  _prev: UpdateEventState,
  formData: FormData,
): Promise<UpdateEventState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=/dashboard/events/${slug}/settings`);

  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const fail = (error: string, field?: string): UpdateEventState => ({
    error,
    field,
    saved: null,
  });

  const event = validateSlug(slug).ok ? await getEventBySlug(slug) : null;
  if (!event) return fail("Event not found.");

  const parsed = parseEventChanges(values, event.kind);
  if (!parsed.ok) return fail(parsed.error, parsed.field);

  const result = await updateEvent(user.id, event.id, parsed.changes);
  if (!result.ok)
    return fail(updateError(result), UPDATE_ERROR_FIELD[result.reason]);

  revalidatePath(`/dashboard/events/${slug}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath(`/e/${slug}`);

  const moved = result.promoted;
  const saved =
    moved === 0
      ? "Saved."
      : `Saved. ${moved} ${moved === 1 ? "person" : "people"} moved off the waitlist and got an email.`;
  return { error: null, saved };
}
