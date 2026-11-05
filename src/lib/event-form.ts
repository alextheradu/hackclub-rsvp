import { parseLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import type { EventChanges, PublicEvent } from "@/lib/events";
import type { EventKind } from "@/lib/slug";
import { parseOptionalHttpUrl } from "@/lib/url";

export type EventFormValues = Record<string, string>;

export type EventField =
  | "title"
  | "startsLocal"
  | "endsLocal"
  | "timezone"
  | "capacity"
  | "website"
  | "onlineUrl";

export type ParsedEventChanges =
  | { ok: true; changes: EventChanges }
  | { ok: false; error: string; field: EventField };

// What the edit form starts with for an existing event.
export function eventFormValues(event: PublicEvent): EventFormValues {
  return {
    title: event.title,
    startsLocal: toLocalDateTime(event.startsAt, event.timezone),
    endsLocal: event.endsAt ? toLocalDateTime(event.endsAt, event.timezone) : "",
    timezone: event.timezone,
    capacity: event.capacity === null ? "" : String(event.capacity),
    website: event.website ?? "",
    onlineUrl: event.onlineUrl ?? "",
    locationDisplay: event.locationDisplay ?? "",
    description: event.description ?? "",
  };
}

export function parseEventChanges(values: EventFormValues, kind: EventKind): ParsedEventChanges {
  const get = (name: string) => (values[name] ?? "").trim();
  const fail = (field: EventField, error: string): ParsedEventChanges => ({ ok: false, error, field });

  const title = get("title");
  if (!title) return fail("title", "Give the event a title.");

  const timezone = get("timezone") || "UTC";
  const startsAt = parseLocalDateTime(get("startsLocal"), timezone);
  if (!startsAt) {
    return fail("startsLocal", "Check the start time. It is missing, invalid, or does not exist in that timezone.");
  }

  let endsAt: Date | null = null;
  if (get("endsLocal")) {
    endsAt = parseLocalDateTime(get("endsLocal"), timezone);
    if (!endsAt) return fail("endsLocal", "Check the end time. It is invalid or does not exist in that timezone.");
    if (endsAt <= startsAt) return fail("endsLocal", "The event has to end after it starts.");
  }

  let capacity: number | null = null;
  if (get("capacity")) {
    capacity = Number(get("capacity"));
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
      return fail("capacity", "Capacity must be a whole number of 1 or more, or left empty.");
    }
  }

  const website = parseOptionalHttpUrl(get("website"));
  const onlineUrl = parseOptionalHttpUrl(get("onlineUrl"));
  if (!website.ok) return fail("website", "Links must start with http:// or https://");
  if (!onlineUrl.ok) return fail("onlineUrl", "Links must start with http:// or https://");

  return {
    ok: true,
    changes: {
      title,
      description: get("description") || null,
      startsAt,
      endsAt,
      timezone,
      capacity,
      website: kind === "ysws" ? website.url : null,
      onlineUrl: kind === "irl" ? onlineUrl.url : null,
      locationDisplay: kind === "irl" ? get("locationDisplay") || null : null,
    },
  };
}
