import { getPool } from "@/lib/db";

export type RosterEntry = {
  rsvpId: number;
  name: string | null;
  email: string;
  slackId: string | null;
  status: "confirmed" | "waitlisted" | "cancelled";
  rsvpedAt: Date;
};

export async function getRoster(userId: number, eventId: number): Promise<RosterEntry[] | null> {
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
     ORDER BY array_position(ARRAY['confirmed', 'waitlisted', 'cancelled'], r.status), r.created_at, r.id`,
    [eventId],
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
