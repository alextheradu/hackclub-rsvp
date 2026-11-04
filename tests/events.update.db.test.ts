import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { cancelEvent, updateEvent, type EventChanges } from "@/lib/events";
import { createRsvp } from "@/lib/rsvps";
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

const STARTS = new Date("2030-06-01T18:00:00Z");

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
     VALUES ($1, 'my-event', 'My Event', $2, 'ysws', $3) RETURNING id`,
    [orgId, STARTS, capacity],
  );
  return { organizer, outsider, eventId: Number(event.rows[0].id) };
}

function changes(overrides: Partial<EventChanges> = {}): EventChanges {
  return {
    title: "Renamed Event",
    description: "New description",
    startsAt: STARTS,
    endsAt: new Date("2030-06-01T21:00:00Z"),
    timezone: "America/New_York",
    capacity: null,
    website: "https://example.com",
    onlineUrl: null,
    locationDisplay: null,
    ...overrides,
  };
}

async function eventRow(eventId: number) {
  const { rows } = await getPool().query("SELECT * FROM events WHERE id = $1", [eventId]);
  return rows[0];
}

async function statusOf(eventId: number, userId: number): Promise<string> {
  const { rows } = await getPool().query(
    "SELECT status FROM rsvps WHERE event_id = $1 AND user_id = $2",
    [eventId, userId],
  );
  return rows[0].status;
}

async function promotionEmails(): Promise<number> {
  const { rows } = await getPool().query(
    "SELECT count(*)::int AS n FROM outbox WHERE kind = 'waitlist_promoted'",
  );
  return rows[0].n;
}

async function rsvpUsers(eventId: number, count: number): Promise<number[]> {
  const users: number[] = [];
  for (let i = 0; i < count; i++) {
    const user = await makeUser(`guest${i}`);
    await createRsvp(eventId, user);
    users.push(user);
  }
  return users;
}

describe("updateEvent", () => {
  it("saves every editable field for an org member", async () => {
    const { organizer, eventId } = await setup();

    expect(await updateEvent(organizer, eventId, changes({ title: "  Renamed Event  " }))).toEqual({
      ok: true,
      promoted: 0,
    });

    const row = await eventRow(eventId);
    expect(row.title).toBe("Renamed Event");
    expect(row.description).toBe("New description");
    expect(row.ends_at).toEqual(new Date("2030-06-01T21:00:00Z"));
    expect(row.timezone).toBe("America/New_York");
    expect(row.website).toBe("https://example.com");
    expect(row.slug).toBe("my-event");
    expect(row.kind).toBe("ysws");
  });

  it("rejects someone outside the event's org and changes nothing", async () => {
    const { outsider, eventId } = await setup();
    expect(await updateEvent(outsider, eventId, changes())).toEqual({ ok: false, reason: "not_member" });
    expect((await eventRow(eventId)).title).toBe("My Event");
  });

  it("returns not_member for an event that does not exist", async () => {
    const { organizer } = await setup();
    expect(await updateEvent(organizer, 999999, changes())).toEqual({ ok: false, reason: "not_member" });
  });

  it("rejects a blank title", async () => {
    const { organizer, eventId } = await setup();
    expect(await updateEvent(organizer, eventId, changes({ title: "   " }))).toEqual({
      ok: false,
      reason: "title",
    });
  });

  it("rejects an end time that is not after the start", async () => {
    const { organizer, eventId } = await setup();
    expect(await updateEvent(organizer, eventId, changes({ endsAt: STARTS }))).toEqual({
      ok: false,
      reason: "dates",
    });
  });

  it("refuses to edit a cancelled event", async () => {
    const { organizer, eventId } = await setup();
    await cancelEvent(organizer, eventId);
    expect(await updateEvent(organizer, eventId, changes())).toEqual({ ok: false, reason: "cancelled" });
    expect((await eventRow(eventId)).title).toBe("My Event");
  });

  it("rejects a capacity below the confirmed count and leaves everyone in place", async () => {
    const { organizer, eventId } = await setup(3);
    const users = await rsvpUsers(eventId, 3);

    expect(await updateEvent(organizer, eventId, changes({ capacity: 2 }))).toEqual({
      ok: false,
      reason: "capacity",
      confirmedCount: 3,
    });
    expect((await eventRow(eventId)).capacity).toBe(3);
    for (const user of users) expect(await statusOf(eventId, user)).toBe("confirmed");
  });

  it("allows lowering capacity to exactly the confirmed count", async () => {
    const { organizer, eventId } = await setup(5);
    await rsvpUsers(eventId, 2);

    expect(await updateEvent(organizer, eventId, changes({ capacity: 2 }))).toEqual({
      ok: true,
      promoted: 0,
    });
    expect((await eventRow(eventId)).capacity).toBe(2);
  });

  it("promotes the waitlist in signup order when capacity goes up", async () => {
    const { organizer, eventId } = await setup(1);
    const [first, second, third, fourth] = await rsvpUsers(eventId, 4);

    expect(await updateEvent(organizer, eventId, changes({ capacity: 3 }))).toEqual({
      ok: true,
      promoted: 2,
    });

    expect(await statusOf(eventId, first)).toBe("confirmed");
    expect(await statusOf(eventId, second)).toBe("confirmed");
    expect(await statusOf(eventId, third)).toBe("confirmed");
    expect(await statusOf(eventId, fourth)).toBe("waitlisted");
    expect(await promotionEmails()).toBe(2);
  });

  it("promotes everyone when the capacity limit is removed", async () => {
    const { organizer, eventId } = await setup(1);
    const users = await rsvpUsers(eventId, 3);

    expect(await updateEvent(organizer, eventId, changes({ capacity: null }))).toEqual({
      ok: true,
      promoted: 2,
    });
    for (const user of users) expect(await statusOf(eventId, user)).toBe("confirmed");
    expect(await promotionEmails()).toBe(2);
  });

  it("does not promote anyone when capacity is unchanged", async () => {
    const { organizer, eventId } = await setup(1);
    const [, waiting] = await rsvpUsers(eventId, 2);

    expect(await updateEvent(organizer, eventId, changes({ capacity: 1 }))).toEqual({
      ok: true,
      promoted: 0,
    });
    expect(await statusOf(eventId, waiting)).toBe("waitlisted");
    expect(await promotionEmails()).toBe(0);
  });
});
