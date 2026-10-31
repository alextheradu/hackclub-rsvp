import { getPool } from "@/lib/db";
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
  const pool = getPool();
  const { rowCount } = await pool.query(
    `SELECT 1 FROM events e
     JOIN org_members m ON m.org_id = e.org_id
     WHERE e.id = $1 AND m.user_id = $2`,
    [eventId, userId],
  );
  if (!rowCount) return null;

  const { rows } = await pool.query(
    `SELECT r.id, u.name, u.email, u.slack_id, r.status, r.created_at
     FROM rsvps r
     JOIN users u ON u.id = r.user_id
     WHERE r.event_id = $1
       AND ($2::text IS NULL OR r.status = $2)
       AND ($3::text IS NULL OR u.name ILIKE $3 OR u.email ILIKE $3 OR u.slack_id ILIKE $3)
     ORDER BY array_position(ARRAY['confirmed', 'waitlisted', 'cancelled'], r.status), r.created_at, r.id`,
    [eventId, filter.status ?? null, filter.q ? likePattern(filter.q) : null],
  );
  return rows.map((row) => ({
    rsvpId: Number(row.id),
    name: row.name,
    email: row.email,
    slackId: row.slack_id,
    status: row.status,
    rsvpedAt: row.created_at,
  }));
}
