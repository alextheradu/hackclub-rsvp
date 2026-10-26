import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { cancelRsvp, createRsvp } from "@/lib/rsvps";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

beforeAll(async () => {
  await wipeSchema();
  await runMigrations(getPool(), resolve(__dirname, "../migrations"));
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

async function makeUsers(count: number, eligible: boolean | null = null): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const { rows } = await getPool().query(
      "INSERT INTO users (hca_id, email, ysws_eligible) VALUES ($1, $2, $3) RETURNING id",
      [`ident!u${i}`, `u${i}@example.com`, eligible],
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

async function makeEvent(
  opts: { capacity?: number | null; cancelled?: boolean; requiresVerification?: boolean } = {},
) {
  const org = await getPool().query("INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id");
  const event = await getPool().query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind, capacity, cancelled_at, requires_verification)
     VALUES ($1, 'my-event', 'My Event', now() + interval '7 days', 'ysws', $2, $3, $4) RETURNING id`,
    [
      org.rows[0].id,
      opts.capacity ?? null,
      opts.cancelled ? new Date() : null,
      opts.requiresVerification ?? false,
    ],
  );
  return { eventId: Number(event.rows[0].id), orgId: Number(org.rows[0].id) };
}

async function statuses(eventId: number): Promise<Record<string, number>> {
  const { rows } = await getPool().query(
    "SELECT status, count(*)::int AS n FROM rsvps WHERE event_id = $1 GROUP BY status",
    [eventId],
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

async function statusOf(eventId: number, userId: number): Promise<string | undefined> {
  const { rows } = await getPool().query(
    "SELECT status FROM rsvps WHERE event_id = $1 AND user_id = $2 AND status <> 'cancelled'",
    [eventId, userId],
  );
  return rows[0]?.status;
}

describe("createRsvp", () => {
  it("confirms everyone when there is no capacity", async () => {
    const { eventId } = await makeEvent({ capacity: null });
    const users = await makeUsers(3);
    for (const user of users) {
      expect(await createRsvp(eventId, user)).toMatchObject({ status: "confirmed" });
    }
  });

  it("confirms the first N and waitlists the next", async () => {
    const { eventId } = await makeEvent({ capacity: 2 });
    const [a, b, c] = await makeUsers(3);
    expect(await createRsvp(eventId, a)).toMatchObject({ status: "confirmed" });
    expect(await createRsvp(eventId, b)).toMatchObject({ status: "confirmed" });
    expect(await createRsvp(eventId, c)).toMatchObject({ status: "waitlisted" });
    expect(await statuses(eventId)).toEqual({ confirmed: 2, waitlisted: 1 });
  });

  it("returns the row id as a number", async () => {
    const { eventId } = await makeEvent();
    const [a] = await makeUsers(1);
    const result = await createRsvp(eventId, a);
    expect(result).toHaveProperty("id");
    expect(typeof (result as { id: number }).id).toBe("number");
  });

  it("never overbooks when 20 people RSVP at the same moment", async () => {
    const { eventId } = await makeEvent({ capacity: 5 });
    const users = await makeUsers(20);
    const results = await Promise.all(users.map((user) => createRsvp(eventId, user)));
    expect(results.every((r) => "status" in r)).toBe(true);
    expect(await statuses(eventId)).toEqual({ confirmed: 5, waitlisted: 15 });
  });

  it("returns the existing RSVP when the same user submits twice", async () => {
    const { eventId } = await makeEvent({ capacity: 1 });
    const [a] = await makeUsers(1);
    const first = await createRsvp(eventId, a);
    const second = await createRsvp(eventId, a);
    expect(second).toEqual(first);
    expect(await statuses(eventId)).toEqual({ confirmed: 1 });
  });

  it("returns one RSVP when the same user double-clicks in parallel", async () => {
    const { eventId } = await makeEvent({ capacity: 5 });
    const [a] = await makeUsers(1);
    const results = await Promise.all([createRsvp(eventId, a), createRsvp(eventId, a), createRsvp(eventId, a)]);
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(await statuses(eventId)).toEqual({ confirmed: 1 });
  });

  it("rejects a cancelled event", async () => {
    const { eventId } = await makeEvent({ cancelled: true });
    const [a] = await makeUsers(1);
    expect(await createRsvp(eventId, a)).toEqual({ error: "cancelled" });
  });

  it("rejects an event that has already ended or started and is closed", async () => {
    const { eventId } = await makeEvent();
    await getPool().query("UPDATE events SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'");
    const [a] = await makeUsers(1);
    expect(await createRsvp(eventId, a)).toEqual({ error: "closed" });
  });

  it("does not let an organizer RSVP to their own event", async () => {
    const { eventId, orgId } = await makeEvent();
    const [a] = await makeUsers(1);
    await getPool().query("INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')", [orgId, a]);
    expect(await createRsvp(eventId, a)).toEqual({ error: "own_event" });
  });

  it("requires ysws_eligible when the event requires verification", async () => {
    const { eventId } = await makeEvent({ requiresVerification: true });
    const [yes] = await makeUsers(1, true);
    expect(await createRsvp(eventId, yes)).toMatchObject({ status: "confirmed" });
    await getPool().query("DELETE FROM users");
    const [no] = await makeUsers(1, false);
    expect(await createRsvp(eventId, no)).toEqual({ error: "not_eligible" });
    await getPool().query("DELETE FROM users");
    const [unknown] = await makeUsers(1, null);
    expect(await createRsvp(eventId, unknown)).toEqual({ error: "not_eligible" });
  });

  it("ignores ysws_eligible when the event does not require verification", async () => {
    const { eventId } = await makeEvent({ requiresVerification: false });
    const [no] = await makeUsers(1, false);
    expect(await createRsvp(eventId, no)).toMatchObject({ status: "confirmed" });
  });
});

describe("cancelRsvp", () => {
  it("promotes the oldest waitlisted user into the freed seat", async () => {
    const { eventId } = await makeEvent({ capacity: 1 });
    const [a, b, c] = await makeUsers(3);
    await createRsvp(eventId, a);
    await createRsvp(eventId, b);
    await createRsvp(eventId, c);
    expect(await cancelRsvp(eventId, a)).toEqual({ promoted: [b] });
    expect(await statusOf(eventId, a)).toBeUndefined();
    expect(await statusOf(eventId, b)).toBe("confirmed");
    expect(await statusOf(eventId, c)).toBe("waitlisted");
  });

  it("keeps the cancelled row as history", async () => {
    const { eventId } = await makeEvent();
    const [a] = await makeUsers(1);
    await createRsvp(eventId, a);
    await cancelRsvp(eventId, a);
    const { rows } = await getPool().query("SELECT status FROM rsvps WHERE event_id = $1", [eventId]);
    expect(rows).toEqual([{ status: "cancelled" }]);
  });

  it("promotes nobody when a waitlisted RSVP is cancelled", async () => {
    const { eventId } = await makeEvent({ capacity: 1 });
    const [a, b] = await makeUsers(2);
    await createRsvp(eventId, a);
    await createRsvp(eventId, b);
    expect(await cancelRsvp(eventId, b)).toEqual({ promoted: [] });
    expect(await statusOf(eventId, a)).toBe("confirmed");
  });

  it("promotes nobody when there is no waitlist", async () => {
    const { eventId } = await makeEvent({ capacity: 2 });
    const [a] = await makeUsers(1);
    await createRsvp(eventId, a);
    expect(await cancelRsvp(eventId, a)).toEqual({ promoted: [] });
  });

  it("is a no-op when the user has no live RSVP", async () => {
    const { eventId } = await makeEvent({ capacity: 1 });
    const [a, b] = await makeUsers(2);
    await createRsvp(eventId, a);
    expect(await cancelRsvp(eventId, b)).toEqual({ promoted: [] });
    expect(await statusOf(eventId, a)).toBe("confirmed");
  });

  it("fills several freed seats at once when capacity was raised", async () => {
    const { eventId } = await makeEvent({ capacity: 1 });
    const [a, b, c, d] = await makeUsers(4);
    await createRsvp(eventId, a);
    await createRsvp(eventId, b);
    await createRsvp(eventId, c);
    await createRsvp(eventId, d);
    await getPool().query("UPDATE events SET capacity = 2 WHERE id = $1", [eventId]);
    expect(await cancelRsvp(eventId, a)).toEqual({ promoted: [b, c] });
    expect(await statusOf(eventId, d)).toBe("waitlisted");
  });

  it("puts someone who cancels and RSVPs again at the back of the waitlist", async () => {
    const { eventId } = await makeEvent({ capacity: 1 });
    const [a, b, c] = await makeUsers(3);
    await createRsvp(eventId, a);
    await createRsvp(eventId, b);
    await cancelRsvp(eventId, b);
    await createRsvp(eventId, c);
    expect(await createRsvp(eventId, b)).toMatchObject({ status: "waitlisted" });
    expect(await cancelRsvp(eventId, a)).toEqual({ promoted: [c] });
  });

  it("does not promote past capacity when cancels race", async () => {
    const { eventId } = await makeEvent({ capacity: 3 });
    const users = await makeUsers(8);
    for (const user of users) await createRsvp(eventId, user);
    await Promise.all(users.slice(0, 3).map((user) => cancelRsvp(eventId, user)));
    expect(await statuses(eventId)).toMatchObject({ confirmed: 3, waitlisted: 2, cancelled: 3 });
  });
});
