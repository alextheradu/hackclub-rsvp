import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { getRoster } from "@/lib/roster";
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

async function makeUser(handle: string, slackId: string | null = null): Promise<number> {
  const { rows } = await getPool().query(
    "INSERT INTO users (hca_id, email, name, slack_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [`ident!${handle}`, `${handle}@example.com`, handle, slackId],
  );
  return Number(rows[0].id);
}

async function setup(capacity: number | null = null) {
  const organizer = await makeUser("organizer");
  const outsider = await makeUser("outsider");
  const org = await getPool().query("INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id");
  await getPool().query("INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
    org.rows[0].id,
    organizer,
  ]);
  const event = await getPool().query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind, capacity)
     VALUES ($1, 'my-event', 'My Event', now() + interval '7 days', 'ysws', $2) RETURNING id`,
    [org.rows[0].id, capacity],
  );
  return { organizer, outsider, eventId: Number(event.rows[0].id) };
}

describe("getRoster", () => {
  it("returns null for someone outside the event's org", async () => {
    const { outsider, eventId } = await setup();
    expect(await getRoster(outsider, eventId)).toBeNull();
  });

  it("returns null for an event that does not exist", async () => {
    const { organizer } = await setup();
    expect(await getRoster(organizer, 999999)).toBeNull();
  });

  it("returns an empty list when nobody has rsvped", async () => {
    const { organizer, eventId } = await setup();
    expect(await getRoster(organizer, eventId)).toEqual([]);
  });

  it("returns attendee details with numeric ids and dates", async () => {
    const { organizer, eventId } = await setup();
    const ada = await makeUser("ada", "U123");
    const created = await createRsvp(eventId, ada);
    const roster = await getRoster(organizer, eventId);
    expect(roster).toHaveLength(1);
    expect(roster![0]).toMatchObject({
      rsvpId: "id" in created ? created.id : -1,
      name: "ada",
      email: "ada@example.com",
      slackId: "U123",
      status: "confirmed",
    });
    expect(typeof roster![0].rsvpId).toBe("number");
    expect(roster![0].rsvpedAt).toBeInstanceOf(Date);
  });

  it("lists confirmed, then waitlisted, then cancelled, oldest first within each", async () => {
    const { organizer, eventId } = await setup(2);
    const [a, b, c, d] = [
      await makeUser("a"),
      await makeUser("b"),
      await makeUser("c"),
      await makeUser("d"),
    ];
    await createRsvp(eventId, a);
    await createRsvp(eventId, b);
    await createRsvp(eventId, c);
    await createRsvp(eventId, d);
    await cancelRsvp(eventId, a);

    const roster = await getRoster(organizer, eventId);
    expect(roster!.map((r) => [r.name, r.status])).toEqual([
      ["b", "confirmed"],
      ["c", "confirmed"],
      ["d", "waitlisted"],
      ["a", "cancelled"],
    ]);
  });

  it("only includes rsvps for the requested event", async () => {
    const { organizer, eventId } = await setup();
    const other = await getPool().query(
      `INSERT INTO events (org_id, slug, title, starts_at, kind)
       SELECT org_id, 'other-event', 'Other', now() + interval '7 days', 'ysws' FROM events WHERE id = $1
       RETURNING id`,
      [eventId],
    );
    const ada = await makeUser("ada");
    await createRsvp(Number(other.rows[0].id), ada);
    expect(await getRoster(organizer, eventId)).toEqual([]);
  });
});
