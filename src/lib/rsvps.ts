import { q, sql, withTx } from "@/lib/db";
import { enqueue } from "@/lib/outbox";
import { decideStatus, promotionCount } from "@/lib/waitlist";

export type CreateRsvpResult =
  | { id: number; status: "confirmed" | "waitlisted" }
  | { error: "closed" | "cancelled" | "own_event" | "not_eligible" };

export async function createRsvp(eventId: number, userId: number): Promise<CreateRsvpResult> {
  return withTx(async (client) => {
    const db = q(client);
    const event = await db.maybe<{
      org_id: string;
      capacity: number | null;
      cancelled_at: Date | null;
      requires_verification: boolean;
      ended: boolean;
    }>(sql`
      SELECT org_id, capacity, cancelled_at, requires_verification,
             coalesce(ends_at, starts_at) < now() AS ended
      FROM events WHERE id = ${eventId} FOR UPDATE`);
    if (!event) return { error: "closed" };
    if (event.cancelled_at) return { error: "cancelled" };
    if (event.ended) return { error: "closed" };

    const existing = await db.maybe<{ id: string; status: "confirmed" | "waitlisted" }>(sql`
      SELECT id, status FROM rsvps
      WHERE event_id = ${eventId} AND user_id = ${userId} AND status <> 'cancelled'`);
    if (existing) return { id: Number(existing.id), status: existing.status };

    const isOrganizer = await db.exec(sql`
      SELECT 1 FROM org_members WHERE org_id = ${event.org_id} AND user_id = ${userId}`);
    if (isOrganizer) return { error: "own_event" };

    if (event.requires_verification) {
      const user = await db.maybe<{ ysws_eligible: boolean | null }>(sql`
        SELECT ysws_eligible FROM users WHERE id = ${userId}`);
      if (user?.ysws_eligible !== true) return { error: "not_eligible" };
    }

    const counts = await db.one<{ confirmed: number }>(sql`
      SELECT count(*)::int AS confirmed FROM rsvps
      WHERE event_id = ${eventId} AND status = 'confirmed'`);
    const status = decideStatus({
      capacity: event.capacity,
      confirmedCount: counts.confirmed,
    });
    const inserted = await db.one<{ id: string }>(sql`
      INSERT INTO rsvps (event_id, user_id, status) VALUES (${eventId}, ${userId}, ${status})
      RETURNING id`);
    const id = Number(inserted.id);
    const kind = status === "confirmed" ? "rsvp_confirmed" : "rsvp_waitlisted";
    await enqueue(client, { channel: "email", kind, payload: { rsvpId: id }, dedupeKey: `${kind}:${id}` });
    return { id, status };
  });
}

export async function cancelRsvp(eventId: number, userId: number): Promise<{ promoted: number[] }> {
  return withTx(async (client) => {
    const db = q(client);
    const event = await db.maybe<{ capacity: number | null }>(sql`
      SELECT capacity FROM events WHERE id = ${eventId} FOR UPDATE`);
    if (!event) return { promoted: [] };

    const cancelled = await db.exec(sql`
      UPDATE rsvps SET status = 'cancelled', status_changed_at = now()
      WHERE event_id = ${eventId} AND user_id = ${userId} AND status <> 'cancelled'`);
    if (!cancelled) return { promoted: [] };

    const counts = await db.one<{ confirmed: number; waitlisted: number }>(sql`
      SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
             count(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted
      FROM rsvps WHERE event_id = ${eventId}`);
    const seats = promotionCount({
      capacity: event.capacity,
      confirmedCount: counts.confirmed,
      waitlistedCount: counts.waitlisted,
    });
    if (seats === 0) return { promoted: [] };

    const next = await db.many<{ id: string; user_id: string }>(sql`
      SELECT id, user_id FROM rsvps WHERE event_id = ${eventId} AND status = 'waitlisted'
      ORDER BY created_at, id LIMIT ${seats}`);
    await db.exec(sql`
      UPDATE rsvps SET status = 'confirmed', status_changed_at = now()
      WHERE id = ANY(${next.map((row) => row.id)}::bigint[])`);
    for (const row of next) {
      const rsvpId = Number(row.id);
      await enqueue(client, {
        channel: "email",
        kind: "waitlist_promoted",
        payload: { rsvpId },
        dedupeKey: `waitlist_promoted:${rsvpId}`,
      });
    }
    return { promoted: next.map((row) => Number(row.user_id)) };
  });
}

export type RsvpSummary = {
  confirmedCount: number;
  waitlistedCount: number;
  myStatus: "confirmed" | "waitlisted" | null;
};

export async function getRsvpSummary(eventId: number, userId: number | null): Promise<RsvpSummary> {
  const db = q();
  const counts = await db.one<{ confirmed: number; waitlisted: number }>(sql`
    SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
           count(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted
    FROM rsvps WHERE event_id = ${eventId}`);

  let myStatus: RsvpSummary["myStatus"] = null;
  if (userId !== null) {
    const mine = await db.maybe<{ status: "confirmed" | "waitlisted" }>(sql`
      SELECT status FROM rsvps
      WHERE event_id = ${eventId} AND user_id = ${userId} AND status <> 'cancelled'`);
    myStatus = mine?.status ?? null;
  }

  return {
    confirmedCount: counts.confirmed,
    waitlistedCount: counts.waitlisted,
    myStatus,
  };
}
