import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { cancelEvent } from "@/lib/events";
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

async function makeUser(handle: string): Promise<number> {
  const { rows } = await getPool().query(
    "INSERT INTO users (hca_id, email, name) VALUES ($1, $2, $3) RETURNING id",
    [`ident!${handle}`, `${handle}@example.com`, handle],
  );
  return Number(rows[0].id);
}

async function setup(capacity: number | null = null) {
  const organizer = await makeUser("organizer");
  const outsider = await makeUser("outsider");
  const org = await getPool().query("INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id");
  const orgId = Number(org.rows[0].id);
  await getPool().query("INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
    orgId,
    organizer,
  ]);
  const event = await getPool().query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind, capacity)
     VALUES ($1, 'my-event', 'My Event', now() + interval '7 days', 'ysws', $2) RETURNING id`,
    [orgId, capacity],
  );
  return { organizer, outsider, orgId, eventId: Number(event.rows[0].id) };
}

async function isCancelled(eventId: number): Promise<boolean> {
  const { rows } = await getPool().query("SELECT cancelled_at FROM events WHERE id = $1", [eventId]);
  return rows[0].cancelled_at !== null;
}

async function cancellationEmails(): Promise<number[]> {
  const { rows } = await getPool().query(
    "SELECT payload FROM outbox WHERE kind = 'event_cancelled' ORDER BY id",
  );
  return rows.map((row) => Number(row.payload.rsvpId));
}

async function rsvpId(eventId: number, userId: number): Promise<number> {
  const { rows } = await getPool().query(
    "SELECT id FROM rsvps WHERE event_id = $1 AND user_id = $2",
    [eventId, userId],
  );
  return Number(rows[0].id);
}

describe("cancelEvent", () => {
  it("marks the event cancelled for an org member", async () => {
    const { organizer, eventId } = await setup();
    expect(await cancelEvent(organizer, eventId)).toBe("ok");
    expect(await isCancelled(eventId)).toBe(true);
  });

  it("rejects someone outside the event's org and leaves the event alone", async () => {
    const { outsider, eventId } = await setup();
    expect(await cancelEvent(outsider, eventId)).toBe("not_member");
    expect(await isCancelled(eventId)).toBe(false);
  });

  it("returns not_member for an event that does not exist", async () => {
    const { organizer } = await setup();
    expect(await cancelEvent(organizer, 999999)).toBe("not_member");
  });

  it("emails every confirmed and waitlisted attendee once", async () => {
    const { organizer, eventId } = await setup(1);
    const ada = await makeUser("ada");
    const bob = await makeUser("bob");
    await createRsvp(eventId, ada);
    await createRsvp(eventId, bob);

    await cancelEvent(organizer, eventId);

    expect(await cancellationEmails()).toEqual([await rsvpId(eventId, ada), await rsvpId(eventId, bob)]);
  });

  it("does not email people who already cancelled their rsvp", async () => {
    const { organizer, eventId } = await setup();
    const ada = await makeUser("ada");
    await createRsvp(eventId, ada);
    await cancelRsvp(eventId, ada);

    await cancelEvent(organizer, eventId);

    expect(await cancellationEmails()).toEqual([]);
  });

  it("does not email attendees of other events", async () => {
    const { organizer, orgId, eventId } = await setup();
    const other = await getPool().query(
      `INSERT INTO events (org_id, slug, title, starts_at, kind)
       VALUES ($1, 'other-event', 'Other', now() + interval '7 days', 'ysws') RETURNING id`,
      [orgId],
    );
    const ada = await makeUser("ada");
    await createRsvp(Number(other.rows[0].id), ada);

    await cancelEvent(organizer, eventId);

    expect(await cancellationEmails()).toEqual([]);
  });

  it("returns already_cancelled the second time and sends nothing new", async () => {
    const { organizer, eventId } = await setup();
    const ada = await makeUser("ada");
    await createRsvp(eventId, ada);

    expect(await cancelEvent(organizer, eventId)).toBe("ok");
    expect(await cancelEvent(organizer, eventId)).toBe("already_cancelled");
    expect(await cancellationEmails()).toHaveLength(1);
  });

  it("blocks new rsvps once cancelled", async () => {
    const { organizer, eventId } = await setup();
    await cancelEvent(organizer, eventId);
    expect(await createRsvp(eventId, await makeUser("ada"))).toEqual({ error: "cancelled" });
  });
});
