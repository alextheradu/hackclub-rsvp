import type { EventKind } from "@/lib/slug";
import { q, sql, withTx } from "@/lib/db";
import { promoteWaitlist } from "@/lib/rsvps";
import { validateSlug } from "@/lib/slug";

export type NewOrg = {
  name: string;
  slug: string;
};

export type CreateOrgResult =
  | { ok: true; id: number }
  | { ok: false; reason: "name" | "format" | "reserved" | "taken" };

export type NewEvent = {
  orgId: number;
  slug: string;
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt?: Date | null;
  timezone?: string;
  description?: string | null;
  capacity?: number | null;
  website?: string | null;
  onlineUrl?: string | null;
  locationDisplay?: string | null;
};

export type CreateEventResult =
  | { ok: true; id: number; slug: string }
  | {
      ok: false;
      reason:
        | "title"
        | "dates"
        | "format"
        | "reserved"
        | "taken"
        | "not_member";
    };

export type OrgSummary = {
  id: number;
  name: string;
  slug: string;
};

export type PublicEvent = {
  id: number;
  slug: string;
  title: string;
  kind: EventKind;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  locationDisplay: string | null;
  onlineUrl: string | null;
  website: string | null;
  capacity: number | null;
  cancelled: boolean;
  orgName: string;
};

export type EventSummary = {
  id: number;
  slug: string;
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  orgName: string;
  cancelled: boolean;
  capacity: number | null;
  confirmedCount: number;
  waitlistedCount: number;
};

export async function createOrg(
  userId: number,
  org: NewOrg,
): Promise<CreateOrgResult> {
  const name = org.name.trim();
  if (!name) return { ok: false, reason: "name" };
  const slug = validateSlug(org.slug);
  if (!slug.ok) return slug;
  try {
    return await withTx(async (client) => {
      const db = q(client);
      const created = await db.one<{ id: string }>(sql`
        INSERT INTO orgs (name, slug) VALUES (${name}, ${org.slug}) RETURNING id`);
      const id = Number(created.id);
      await db.exec(sql`
        INSERT INTO org_members (org_id, user_id, role) VALUES (${id}, ${userId}, 'owner')`);
      return { ok: true as const, id };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "taken" };
    }
    throw error;
  }
}

export async function createEvent(
  userId: number,
  event: NewEvent,
): Promise<CreateEventResult> {
  const title = event.title.trim();
  if (!title) return { ok: false, reason: "title" };
  if (event.endsAt && event.endsAt <= event.startsAt) {
    return { ok: false, reason: "dates" };
  }
  const slug = validateSlug(event.slug);
  if (!slug.ok) return slug;
  try {
    return await withTx(async (client) => {
      const db = q(client);
      const isMember = await db.exec(sql`
        SELECT 1 FROM org_members WHERE org_id = ${event.orgId} AND user_id = ${userId}`);
      if (!isMember) {
        return { ok: false as const, reason: "not_member" as const };
      }
      const row = await db.one<{ id: string }>(sql`
        INSERT INTO events
          (org_id, slug, title, description, kind, starts_at, ends_at,
           timezone, capacity, website, online_url, location_display)
        VALUES (${event.orgId}, ${event.slug}, ${title}, ${event.description ?? null},
                ${event.kind}, ${event.startsAt}, ${event.endsAt ?? null},
                ${event.timezone ?? "UTC"}, ${event.capacity ?? null}, ${event.website ?? null},
                ${event.onlineUrl ?? null}, ${event.locationDisplay ?? null})
        RETURNING id`);
      return { ok: true as const, id: Number(row.id), slug: event.slug };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "taken" };
    }
    throw error;
  }
}

export async function listEventsForUser(
  userId: number,
): Promise<EventSummary[]> {
  const rows = await q().many<{
    id: string;
    slug: string;
    title: string;
    kind: EventKind;
    starts_at: Date;
    ends_at: Date | null;
    timezone: string;
    org_name: string;
    cancelled: boolean;
    capacity: number | null;
    confirmed: number;
    waitlisted: number;
  }>(sql`
    SELECT e.id, e.slug, e.title, e.kind, e.starts_at, e.ends_at, e.timezone, o.name AS org_name,
           e.cancelled_at IS NOT NULL AS cancelled, e.capacity, c.confirmed, c.waitlisted
    FROM events e
    JOIN orgs o ON o.id = e.org_id
    JOIN org_members m ON m.org_id = e.org_id
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.status = 'confirmed')::int AS confirmed,
             count(*) FILTER (WHERE r.status = 'waitlisted')::int AS waitlisted
      FROM rsvps r
      WHERE r.event_id = e.id
    ) c
    WHERE m.user_id = ${userId}
    ORDER BY e.starts_at ASC, e.id ASC`);
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    orgName: row.org_name,
    cancelled: row.cancelled,
    capacity: row.capacity,
    confirmedCount: row.confirmed,
    waitlistedCount: row.waitlisted,
  }));
}

export async function listOrgsForUser(userId: number): Promise<OrgSummary[]> {
  const rows = await q().many<{ id: string; name: string; slug: string }>(sql`
    SELECT o.id, o.name, o.slug
    FROM orgs o
    JOIN org_members m ON m.org_id = o.id
    WHERE m.user_id = ${userId}
    ORDER BY lower(o.name), o.id`);
  return rows.map((row) => ({ id: Number(row.id), name: row.name, slug: row.slug }));
}

export async function isEventSlugTaken(slug: string): Promise<boolean> {
  return (await q().exec(sql`SELECT 1 FROM events WHERE slug = ${slug}`)) !== 0;
}

export async function getEventBySlug(slug: string): Promise<PublicEvent | null> {
  const row = await q().maybe<{
    id: string;
    slug: string;
    title: string;
    kind: EventKind;
    description: string | null;
    starts_at: Date;
    ends_at: Date | null;
    timezone: string;
    location_display: string | null;
    online_url: string | null;
    website: string | null;
    capacity: number | null;
    cancelled: boolean;
    org_name: string;
  }>(sql`
    SELECT e.id, e.slug, e.title, e.kind, e.description, e.starts_at, e.ends_at,
           e.timezone, e.location_display, e.online_url, e.website, e.capacity,
           e.cancelled_at IS NOT NULL AS cancelled, o.name AS org_name
    FROM events e
    JOIN orgs o ON o.id = e.org_id
    WHERE e.slug = ${slug}`);
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    locationDisplay: row.location_display,
    onlineUrl: row.online_url,
    website: row.website,
    capacity: row.capacity,
    cancelled: row.cancelled,
    orgName: row.org_name,
  };
}

export async function canManageEvent(userId: number, eventId: number): Promise<boolean> {
  const rows = await q().exec(sql`
    SELECT 1 FROM events e
    JOIN org_members m ON m.org_id = e.org_id
    WHERE e.id = ${eventId} AND m.user_id = ${userId}`);
  return rows > 0;
}

export type CancelEventResult = "ok" | "not_member" | "already_cancelled";

export async function cancelEvent(userId: number, eventId: number): Promise<CancelEventResult> {
  return withTx(async (client) => {
    const db = q(client);
    const event = await db.maybe<{ cancelled_at: Date | null }>(sql`
      SELECT e.cancelled_at FROM events e
      JOIN org_members m ON m.org_id = e.org_id
      WHERE e.id = ${eventId} AND m.user_id = ${userId}
      FOR UPDATE OF e`);
    if (!event) return "not_member";
    if (event.cancelled_at !== null) return "already_cancelled";
    await db.exec(sql`UPDATE events SET cancelled_at = now() WHERE id = ${eventId}`);
    await db.exec(sql`
      INSERT INTO outbox (channel, kind, payload, dedupe_key)
      SELECT 'email', 'event_cancelled', json_build_object('rsvpId', r.id), 'event_cancelled_' || r.id
      FROM rsvps r
      WHERE r.event_id = ${eventId} AND r.status IN ('confirmed', 'waitlisted')
      ORDER BY r.id
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`);
    return "ok";
  });
}

export type EventChanges = {
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  capacity: number | null;
  website: string | null;
  onlineUrl: string | null;
  locationDisplay: string | null;
};

export type UpdateEventResult =
  | { ok: true; promoted: number }
  | { ok: false; reason: "title" | "dates" | "not_member" | "cancelled" }
  | { ok: false; reason: "capacity"; confirmedCount: number };

export async function updateEvent(
  userId: number,
  eventId: number,
  changes: EventChanges,
): Promise<UpdateEventResult> {
  const title = changes.title.trim();
  if (!title) return { ok: false, reason: "title" };
  if (changes.endsAt && changes.endsAt <= changes.startsAt) {
    return { ok: false, reason: "dates" };
  }

  return withTx(async (client) => {
    const db = q(client);
    const event = await db.maybe<{ cancelled_at: Date | null }>(sql`
      SELECT e.cancelled_at FROM events e
      JOIN org_members m ON m.org_id = e.org_id
      WHERE e.id = ${eventId} AND m.user_id = ${userId}
      FOR UPDATE OF e`);
    if (!event) return { ok: false as const, reason: "not_member" as const };
    if (event.cancelled_at !== null) return { ok: false as const, reason: "cancelled" as const };

    if (changes.capacity !== null) {
      const { confirmed } = await db.one<{ confirmed: number }>(sql`
        SELECT count(*)::int AS confirmed FROM rsvps
        WHERE event_id = ${eventId} AND status = 'confirmed'`);
      if (changes.capacity < confirmed) {
        return { ok: false as const, reason: "capacity" as const, confirmedCount: confirmed };
      }
    }

    await db.exec(sql`
      UPDATE events SET
        title = ${title},
        description = ${changes.description},
        starts_at = ${changes.startsAt},
        ends_at = ${changes.endsAt},
        timezone = ${changes.timezone},
        capacity = ${changes.capacity},
        website = ${changes.website},
        online_url = ${changes.onlineUrl},
        location_display = ${changes.locationDisplay}
      WHERE id = ${eventId}`);

    const promoted = await promoteWaitlist(client, eventId, changes.capacity);
    return { ok: true as const, promoted: promoted.length };
  });
}
