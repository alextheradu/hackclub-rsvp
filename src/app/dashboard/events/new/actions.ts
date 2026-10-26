"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { parseLocalDateTime } from "@/lib/datetime";
import {
  createEvent,
  createOrg,
  isEventSlugTaken,
  listOrgsForUser,
  type CreateEventResult,
} from "@/lib/events";
import { slugify, validateSlug, type EventKind } from "@/lib/slug";
import { parseOptionalHttpUrl } from "@/lib/url";

export type FormState = {
  error?: string;
  values: Record<string, string>;
};

const KINDS: EventKind[] = ["ysws", "irl"];

const EVENT_ERRORS: Record<Extract<CreateEventResult, { ok: false }>["reason"], string> = {
  title: "Give the event a title.",
  dates: "The event has to end after it starts.",
  format: "The URL name must be 3 to 40 characters: lowercase letters, numbers and hyphens.",
  reserved: "That URL name is reserved. Try another.",
  taken: "That URL name is already taken. Try another.",
  not_member: "You are not a member of that organization.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function createOrgForUser(userId: number, name: string): Promise<number | null> {
  const base = slugify(name).slice(0, 35);
  const usable = validateSlug(base).ok ? base : "org";
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? usable : `${usable}-${randomBytes(2).toString("hex")}`;
    const result = await createOrg(userId, { name, slug });
    if (result.ok) return result.id;
    if (result.reason !== "taken") return null;
  }
  return null;
}

export async function createEventAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/dashboard/events/new");

  const values = Object.fromEntries(
    [...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const fail = (error: string): FormState => ({ error, values });

  const title = field(formData, "title").trim();
  if (!title) return fail(EVENT_ERRORS.title);

  const kind = field(formData, "kind") as EventKind;
  if (!KINDS.includes(kind)) return fail("Pick what kind of event this is.");

  const slug = field(formData, "slug").trim() || slugify(title);
  const slugCheck = validateSlug(slug);
  if (!slugCheck.ok) return fail(EVENT_ERRORS[slugCheck.reason]);

  const timezone = field(formData, "timezone").trim() || "UTC";
  const startsAt = parseLocalDateTime(field(formData, "startsLocal"), timezone);
  if (!startsAt) {
    return fail("Check the start time. It is missing, invalid, or does not exist in that timezone.");
  }
  const endsRaw = field(formData, "endsLocal").trim();
  let endsAt: Date | null = null;
  if (endsRaw) {
    endsAt = parseLocalDateTime(endsRaw, timezone);
    if (!endsAt) return fail("Check the end time. It is invalid or does not exist in that timezone.");
  }

  const capacityRaw = field(formData, "capacity").trim();
  let capacity: number | null = null;
  if (capacityRaw) {
    capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
      return fail("Capacity must be a whole number of 1 or more, or left empty.");
    }
  }

  const website = parseOptionalHttpUrl(field(formData, "website"));
  const onlineUrl = parseOptionalHttpUrl(field(formData, "onlineUrl"));
  if (!website.ok || !onlineUrl.ok) {
    return fail("Links must start with http:// or https://");
  }

  if (await isEventSlugTaken(slug)) return fail(EVENT_ERRORS.taken);

  const orgs = await listOrgsForUser(user.id);
  const orgChoice = field(formData, "org");
  let orgId: number;
  if (orgs.length > 0 && orgChoice !== "new") {
    orgId = Number(orgChoice);
    if (!orgs.some((org) => org.id === orgId)) return fail(EVENT_ERRORS.not_member);
  } else {
    const orgName = field(formData, "orgName").trim() || user.name || user.email;
    const createdId = await createOrgForUser(user.id, orgName);
    if (createdId === null) return fail("Could not create the organization. Try a different name.");
    orgId = createdId;
  }

  const description = field(formData, "description").trim();
  const result = await createEvent(user.id, {
    orgId,
    slug,
    title,
    kind,
    startsAt,
    endsAt,
    timezone,
    description: description || null,
    capacity,
    website: kind === "ysws" ? website.url : null,
    onlineUrl: onlineUrl.url,
    locationDisplay: kind === "irl" ? field(formData, "locationDisplay").trim() || null : null,
  });
  if (!result.ok) return fail(EVENT_ERRORS[result.reason]);

  redirect("/dashboard");
}
