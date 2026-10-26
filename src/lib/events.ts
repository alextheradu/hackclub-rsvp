import type { EventKind } from "@/lib/slug";
import { getPool, withTx } from "@/lib/db";
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

export type EventSummary = {
  id: number;
  slug: string;
  title: string;
  kind: EventKind;
  startsAt: Date;
  timezone: string;
  orgName: string;
  cancelled: boolean;
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
      const { rows} = await client.query (
        "INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id",
        [name, org.slug]
      );
      const id = Number(rows[0].id);
      await client.query(
        "INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')",
        [id, userId]
      );
      return { ok: true as const, id };
    }
    );
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
      const member = await client.query(
        "SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2",
        [event.orgId, userId],
      );
      if (member.rowCount === 0) {
        return { ok: false as const, reason: "not_member" as const };
      }
      const { rows } = await client.query(
        `INSERT INTO events
           (org_id, slug, title, description, kind, starts_at, ends_at,
            timezone, capacity, website, online_url, location_display)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          event.orgId,
          event.slug,
          title,
          event.description ?? null,
          event.kind,
          event.startsAt,
          event.endsAt ?? null,
          event.timezone ?? "UTC",
          event.capacity ?? null,
          event.website ?? null,
          event.onlineUrl ?? null,
          event.locationDisplay ?? null,
        ],
      );
      return { ok: true as const, id: Number(rows[0].id), slug: event.slug };
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
  const { rows } = await getPool().query(
    `SELECT e.id, e.slug, e.title, e.kind, e.starts_at, e.timezone, o.name AS org_name,
            e.cancelled_at IS NOT NULL AS cancelled
     FROM events e
     JOIN orgs o ON o.id = e.org_id
     JOIN org_members m ON m.org_id = e.org_id
     WHERE m.user_id = $1
     ORDER BY e.starts_at ASC, e.id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    startsAt: row.starts_at,
    timezone: row.timezone,
    orgName: row.org_name,
    cancelled: row.cancelled,
  }));
}

export async function listOrgsForUser(userId: number): Promise<OrgSummary[]> {
  const { rows } = await getPool().query(
    `SELECT o.id, o.name, o.slug
     FROM orgs o
     JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = $1
     ORDER BY lower(o.name), o.id`,
    [userId],
  );
  return rows.map((row) => ({ id: Number(row.id), name: row.name, slug: row.slug }));
}
