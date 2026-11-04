import { q, sql } from "@/lib/db";
import { likePattern, type RosterFilter, type RosterStatus } from "@/lib/roster-filter";

export type RosterEntry = {
  rsvpId: number;
  name: string | null;
  email: string;
  slackId: string | null;
  status: RosterStatus;
  rsvpedAt: Date;
};

export async function getRoster(
  userId: number,
  eventId: number,
  filter: RosterFilter = {},
): Promise<RosterEntry[] | null> {
  const db = q();
  const isMember = await db.exec(sql`
    SELECT 1 FROM events e
    JOIN org_members m ON m.org_id = e.org_id
    WHERE e.id = ${eventId} AND m.user_id = ${userId}`);
  if (!isMember) return null;

  const status = filter.status ?? null;
  const pattern = filter.q ? likePattern(filter.q) : null;
  const rows = await db.many<{
    id: string;
    name: string | null;
    email: string;
    slack_id: string | null;
    status: RosterStatus;
    created_at: Date;
  }>(sql`
    SELECT r.id, u.name, u.email, u.slack_id, r.status, r.created_at
    FROM rsvps r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ${eventId}
      AND (${status}::text IS NULL OR r.status = ${status})
      AND (${pattern}::text IS NULL OR u.name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.slack_id ILIKE ${pattern})
    ORDER BY array_position(ARRAY['confirmed', 'waitlisted', 'cancelled'], r.status), r.created_at, r.id`);
  return rows.map((row) => ({
    rsvpId: Number(row.id),
    name: row.name,
    email: row.email,
    slackId: row.slack_id,
    status: row.status,
    rsvpedAt: row.created_at,
  }));
}

export async function getRecentRsvps(
  userId: number,
  eventId: number,
  limit = 5,
): Promise<RosterEntry[]> {
  const rows = await q().many<{
    id: string;
    name: string | null;
    email: string;
    slack_id: string | null;
    status: RosterStatus;
    created_at: Date;
  }>(sql`
    SELECT r.id, u.name, u.email, u.slack_id, r.status, r.created_at
    FROM rsvps r
    JOIN users u ON u.id = r.user_id
    JOIN events e ON e.id = r.event_id
    JOIN org_members m ON m.org_id = e.org_id AND m.user_id = ${userId}
    WHERE r.event_id = ${eventId} AND r.status <> 'cancelled'
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${limit}`);
  return rows.map((row) => ({
    rsvpId: Number(row.id),
    name: row.name,
    email: row.email,
    slackId: row.slack_id,
    status: row.status,
    rsvpedAt: row.created_at,
  }));
}
