import { q, sql } from "@/lib/db";
import {
  likePattern,
  type RosterFilter,
  type RosterStatus,
} from "@/lib/roster-filter";
import type { DayCount } from "@/lib/rsvp-timeline";

export type RosterEntry = {
  rsvpId: number;
  name: string | null;
  email: string;
  slackId: string | null;
  avatarUrl: string | null;
  status: RosterStatus;
  rsvpedAt: Date;
};

type EntryRow = {
  id: string;
  name: string | null;
  email: string;
  slack_id: string | null;
  avatar_url: string | null;
  status: RosterStatus;
  created_at: Date;
};

function toEntry(row: EntryRow): RosterEntry {
  return {
    rsvpId: Number(row.id),
    name: row.name,
    email: row.email,
    slackId: row.slack_id,
    avatarUrl: row.avatar_url,
    status: row.status,
    rsvpedAt: row.created_at,
  };
}

export type RosterCounts = Record<RosterStatus, number> & { all: number };

async function isEventMember(
  db: ReturnType<typeof q>,
  userId: number,
  eventId: number,
): Promise<boolean> {
  const rows = await db.exec(sql`
    SELECT 1 FROM events e
    JOIN org_members m ON m.org_id = e.org_id
    WHERE e.id = ${eventId} AND m.user_id = ${userId}`);
  return rows > 0;
}

export async function getRoster(
  userId: number,
  eventId: number,
  filter: RosterFilter = {},
): Promise<RosterEntry[] | null> {
  const db = q();
  if (!(await isEventMember(db, userId, eventId))) return null;

  const status = filter.status ?? null;
  const pattern = filter.q ? likePattern(filter.q) : null;
  const rows = await db.many<EntryRow>(sql`
    SELECT r.id, u.name, u.email, u.slack_id, u.avatar_url, r.status, r.created_at
    FROM rsvps r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ${eventId}
      AND (${status}::text IS NULL OR r.status = ${status})
      AND (${pattern}::text IS NULL OR u.name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.slack_id ILIKE ${pattern})
    ORDER BY array_position(ARRAY['confirmed', 'waitlisted', 'cancelled'], r.status), r.created_at, r.id`);
  return rows.map(toEntry);
}

// Counts per status for the roster filter. The search applies, the status filter doesn't.
export async function getRosterCounts(
  userId: number,
  eventId: number,
  search?: string,
): Promise<RosterCounts | null> {
  const db = q();
  if (!(await isEventMember(db, userId, eventId))) return null;

  const pattern = search ? likePattern(search) : null;
  const row = await db.one<RosterCounts>(sql`
    SELECT count(*)::int AS "all",
           count(*) FILTER (WHERE r.status = 'confirmed')::int AS confirmed,
           count(*) FILTER (WHERE r.status = 'waitlisted')::int AS waitlisted,
           count(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled
    FROM rsvps r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ${eventId}
      AND (${pattern}::text IS NULL OR u.name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.slack_id ILIKE ${pattern})`);
  return row;
}

export async function getRecentRsvps(
  userId: number,
  eventId: number,
  limit = 5,
): Promise<RosterEntry[]> {
  const rows = await q().many<EntryRow>(sql`
    SELECT r.id, u.name, u.email, u.slack_id, u.avatar_url, r.status, r.created_at
    FROM rsvps r
    JOIN users u ON u.id = r.user_id
    JOIN events e ON e.id = r.event_id
    JOIN org_members m ON m.org_id = e.org_id AND m.user_id = ${userId}
    WHERE r.event_id = ${eventId} AND r.status <> 'cancelled'
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${limit}`);
  return rows.map(toEntry);
}

export async function getRsvpDays(
  userId: number,
  eventId: number,
): Promise<DayCount[]> {
  return q().many<DayCount>(sql`
    SELECT to_char(r.created_at AT TIME ZONE e.timezone, 'YYYY-MM-DD') AS day,
           count(*)::int AS count
    FROM rsvps r
    JOIN events e ON e.id = r.event_id
    JOIN org_members m ON m.org_id = e.org_id AND m.user_id = ${userId}
    WHERE r.event_id = ${eventId} AND r.status <> 'cancelled'
    GROUP BY day
    ORDER BY day`);
}
