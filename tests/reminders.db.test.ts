import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { queueReminders } from "@/lib/reminders";
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

async function setup(startsIn: string, rsvpAge = "3 days", status = "confirmed") {
  const pool = getPool();
  const user = await pool.query("INSERT INTO users (hca_id, email) VALUES ('ident!a', 'a@example.com') RETURNING id");
  const org = await pool.query("INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id");
  const event = await pool.query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind)
     VALUES ($1, 'my-event', 'My Event', now() + $2::interval, 'ysws') RETURNING id`,
    [org.rows[0].id, startsIn],
  );
  const rsvp = await pool.query(
    `INSERT INTO rsvps (event_id, user_id, status, status_changed_at)
     VALUES ($1, $2, $3, now() - $4::interval) RETURNING id`,
    [event.rows[0].id, user.rows[0].id, status, rsvpAge],
  );
  return { eventId: Number(event.rows[0].id), rsvpId: Number(rsvp.rows[0].id) };
}

describe("queueReminders", () => {
  it("queues one reminder for an event starting within 24 hours", async () => {
    await setup("12 hours");
    expect(await queueReminders()).toBe(1);
    expect(await queueReminders()).toBe(0);
  });

  it("queues an email job pointing at the rsvp", async () => {
    const { rsvpId } = await setup("12 hours");
    await queueReminders();
    const { rows } = await getPool().query("SELECT channel, kind, payload, status FROM outbox");
    expect(rows).toEqual([
      { channel: "email", kind: "event_reminder", payload: { rsvpId }, status: "pending" },
    ]);
  });

  it("waits until the event is less than 24 hours away", async () => {
    await setup("2 days");
    expect(await queueReminders()).toBe(0);
  });

  it("skips events that already started", async () => {
    await setup("-1 hour");
    expect(await queueReminders()).toBe(0);
  });

  it("skips cancelled events", async () => {
    const { eventId } = await setup("12 hours");
    await getPool().query("UPDATE events SET cancelled_at = now() WHERE id = $1", [eventId]);
    expect(await queueReminders()).toBe(0);
  });

  it("skips waitlisted and cancelled rsvps", async () => {
    await setup("12 hours", "3 days", "waitlisted");
    expect(await queueReminders()).toBe(0);
    await getPool().query("UPDATE rsvps SET status = 'cancelled'");
    expect(await queueReminders()).toBe(0);
  });

  it("skips people who rsvped or got promoted within the last day before the event", async () => {
    await setup("12 hours", "1 hour");
    expect(await queueReminders()).toBe(0);
  });
});
