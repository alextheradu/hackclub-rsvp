"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { parseEventChanges } from "@/lib/event-form";
import {
  createEvent,
  createOrg,
  isEventSlugTaken,
  listOrgsForUser,
  type CreateEventResult,
} from "@/lib/events";
import { hit, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { slugify, validateSlug, type EventKind } from "@/lib/slug";

export type FormState = {
  error?: string;
  field?: string;
  values: Record<string, string>;
};

const KINDS: EventKind[] = ["ysws", "irl"];

const EVENT_ERRORS: Record<
  Extract<CreateEventResult, { ok: false }>["reason"],
  string
> = {
  title: "Give the event a title.",
  dates: "The event has to end after it starts.",
  format:
    "The URL name must be 3 to 40 characters: lowercase letters, numbers and hyphens.",
  reserved: "That URL name is reserved. Try another.",
  taken: "That URL name is already taken. Try another.",
  not_member: "You are not a member of that organization.",
};

const ERROR_FIELD: Record<
  Extract<CreateEventResult, { ok: false }>["reason"],
  string
> = {
  title: "title",
  dates: "endsLocal",
  format: "slug",
  reserved: "slug",
  taken: "slug",
  not_member: "org",
};

async function createOrgForUser(
  userId: number,
  name: string,
): Promise<number | null> {
  const base = slugify(name).slice(0, 35);
  const usable = validateSlug(base).ok ? base : "org";
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? usable : `${usable}-${randomBytes(2).toString("hex")}`;
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
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const fail = (error: string, field?: string): FormState => ({
    error,
    field,
    values,
  });
  const get = (name: string) => (values[name] ?? "").trim();

  if (!(await hit(`create-event:user:${user.id}`, 10, 3600)).allowed) {
    return fail(RATE_LIMIT_MESSAGE);
  }

  const kind = get("kind") as EventKind;
  if (!KINDS.includes(kind))
    return fail("Pick what kind of event this is.", "kind");

  const parsed = parseEventChanges(values, kind);
  if (!parsed.ok) return fail(parsed.error, parsed.field);

  const slug = get("slug") || slugify(parsed.changes.title);
  const slugCheck = validateSlug(slug);
  if (!slugCheck.ok) return fail(EVENT_ERRORS[slugCheck.reason], "slug");
  if (await isEventSlugTaken(slug)) return fail(EVENT_ERRORS.taken, "slug");

  const orgs = await listOrgsForUser(user.id);
  const orgChoice = get("org");
  let orgId: number;
  if (orgs.length > 0 && orgChoice !== "new") {
    orgId = Number(orgChoice);
    if (!orgs.some((org) => org.id === orgId))
      return fail(EVENT_ERRORS.not_member, "org");
  } else {
    const orgName = get("orgName") || user.name || user.email;
    const createdId = await createOrgForUser(user.id, orgName);
    if (createdId === null)
      return fail(
        "Could not create the organization. Try a different name.",
        "orgName",
      );
    orgId = createdId;
  }

  const result = await createEvent(user.id, {
    orgId,
    slug,
    kind,
    ...parsed.changes,
  });
  if (!result.ok)
    return fail(EVENT_ERRORS[result.reason], ERROR_FIELD[result.reason]);

  redirect(`/dashboard/events/${result.slug}`);
}
