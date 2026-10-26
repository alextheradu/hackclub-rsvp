import { withTx } from "@/lib/db";
import { decideStatus, promotionCount } from "@/lib/waitlist";

export type CreateRsvpResult =
  | { id: number; status: "confirmed" | "waitlisted" }
  | { error: "closed" | "cancelled" | "own_event" | "not_eligible" };

export async function createRsvp(eventId: number, userId: number): Promise<CreateRsvpResult> {
  return withTx(async (client) => {
    const { rows: events } = await client.query(
      `SELECT org_id, capacity, cancelled_at, requires_verification,
              coalesce(ends_at, starts_at) < now() AS ended
       FROM events WHERE id = $1 FOR UPDATE`,
      [eventId],
    );
    const event = events[0];
    if (!event) return { error: "closed" };
    if (event.cancelled_at) return { error: "cancelled" };
    if (event.ended) return { error: "closed" };

    const { rows: existing } = await client.query(
      "SELECT id, status FROM rsvps WHERE event_id = $1 AND user_id = $2 AND status <> 'cancelled'",
      [eventId, userId],
    );
    if (existing[0]) return { id: Number(existing[0].id), status: existing[0].status };

    const { rowCount } = await client.query(
      "SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2",
      [event.org_id, userId],
    );
    if (rowCount) return { error: "own_event" };

    if (event.requires_verification) {
      const { rows: users } = await client.query("SELECT ysws_eligible FROM users WHERE id = $1", [userId]);
      if (users[0]?.ysws_eligible !== true) return { error: "not_eligible" };
    }

    const { rows: counts } = await client.query(
      "SELECT count(*)::int AS confirmed FROM rsvps WHERE event_id = $1 AND status = 'confirmed'",
      [eventId],
    );
    const status = decideStatus({
      capacity: event.capacity,
      confirmedCount: counts[0].confirmed,
    });
    const { rows: inserted } = await client.query(
      "INSERT INTO rsvps (event_id, user_id, status) VALUES ($1, $2, $3) RETURNING id",
      [eventId, userId, status],
    );
    return { id: Number(inserted[0].id), status };
  });
}

export async function cancelRsvp(eventId: number, userId: number): Promise<{ promoted: number[] }> {
  return withTx(async (client) => {
    const { rows: events } = await client.query(
      "SELECT capacity FROM events WHERE id = $1 FOR UPDATE",
      [eventId],
    );
    if (!events[0]) return { promoted: [] };

    const { rowCount } = await client.query(
      `UPDATE rsvps SET status = 'cancelled', status_changed_at = now()
       WHERE event_id = $1 AND user_id = $2 AND status <> 'cancelled'`,
      [eventId, userId],
    );
    if (!rowCount) return { promoted: [] };

    const { rows: counts } = await client.query(
      `SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
              count(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted
       FROM rsvps WHERE event_id = $1`,
      [eventId],
    );
    const seats = promotionCount({
      capacity: events[0].capacity,
      confirmedCount: counts[0].confirmed,
      waitlistedCount: counts[0].waitlisted,
    });
    if (seats === 0) return { promoted: [] };

    const { rows: next } = await client.query(
      `SELECT id, user_id FROM rsvps WHERE event_id = $1 AND status = 'waitlisted'
       ORDER BY created_at, id LIMIT $2`,
      [eventId, seats],
    );
    await client.query(
      "UPDATE rsvps SET status = 'confirmed', status_changed_at = now() WHERE id = ANY($1::bigint[])",
      [next.map((row) => row.id)],
    );
    return { promoted: next.map((row) => Number(row.user_id)) };
  });
}
