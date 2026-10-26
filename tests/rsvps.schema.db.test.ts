import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
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

async function seed() {
  const pool = getPool();
  const users = await pool.query(
    `INSERT INTO users (hca_id, email) VALUES ('ident!a', 'a@example.com'), ('ident!b', 'b@example.com')
     RETURNING id`,
  );
  const org = await pool.query("INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id");
  const event = await pool.query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind)
     VALUES ($1, 'my-event', 'My Event', now() + interval '7 days', 'ysws') RETURNING id`,
    [org.rows[0].id],
  );
  return {
    ada: users.rows[0].id as string,
    grace: users.rows[1].id as string,
    eventId: event.rows[0].id as string,
  };
}

function insertRsvp(eventId: string, userId: string, status: string) {
  return getPool().query(
    "INSERT INTO rsvps (event_id, user_id, status) VALUES ($1, $2, $3) RETURNING *",
    [eventId, userId, status],
  );
}

describe("rsvps schema (migration 003)", () => {
  it("has the columns the app needs", async () => {
    const { rows } = await getPool().query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'rsvps'",
    );
    const columns = rows.map((r) => r.column_name);
    for (const name of [
      "id",
      "event_id",
      "user_id",
      "status",
      "created_at",
      "status_changed_at",
      "checked_in_at",
      "checked_in_by",
      "notifications_enabled",
    ]) {
      expect(columns).toContain(name);
    }
  });

  it("fills sensible defaults", async () => {
    const { ada, eventId } = await seed();
    const { rows } = await insertRsvp(eventId, ada, "confirmed");
    expect(rows[0]).toMatchObject({
      status: "confirmed",
      checked_in_at: null,
      checked_in_by: null,
      notifications_enabled: true,
    });
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].status_changed_at).toBeInstanceOf(Date);
  });

  it("accepts the three statuses and rejects anything else", async () => {
    const { ada, grace, eventId } = await seed();
    await expect(insertRsvp(eventId, ada, "confirmed")).resolves.toBeDefined();
    await expect(insertRsvp(eventId, grace, "waitlisted")).resolves.toBeDefined();
    await getPool().query("DELETE FROM rsvps");
    await expect(insertRsvp(eventId, ada, "cancelled")).resolves.toBeDefined();
    await expect(insertRsvp(eventId, grace, "maybe")).rejects.toThrow();
  });

  it("requires a status", async () => {
    const { ada, eventId } = await seed();
    await expect(
      getPool().query("INSERT INTO rsvps (event_id, user_id) VALUES ($1, $2)", [eventId, ada]),
    ).rejects.toThrow();
  });

  it("allows only one live RSVP per person per event", async () => {
    const { ada, eventId } = await seed();
    await insertRsvp(eventId, ada, "confirmed");
    await expect(insertRsvp(eventId, ada, "confirmed")).rejects.toThrow();
    await expect(insertRsvp(eventId, ada, "waitlisted")).rejects.toThrow();
  });

  it("lets someone RSVP again after cancelling, and keeps the history", async () => {
    const { ada, eventId } = await seed();
    await insertRsvp(eventId, ada, "cancelled");
    await insertRsvp(eventId, ada, "cancelled");
    await expect(insertRsvp(eventId, ada, "confirmed")).resolves.toBeDefined();
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM rsvps");
    expect(rows[0].n).toBe(3);
  });

  it("lets different people RSVP to the same event", async () => {
    const { ada, grace, eventId } = await seed();
    await insertRsvp(eventId, ada, "confirmed");
    await expect(insertRsvp(eventId, grace, "confirmed")).resolves.toBeDefined();
  });

  it("deletes RSVPs with their event", async () => {
    const { ada, eventId } = await seed();
    await insertRsvp(eventId, ada, "confirmed");
    await getPool().query("DELETE FROM events WHERE id = $1", [eventId]);
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM rsvps");
    expect(rows[0].n).toBe(0);
  });

  it("deletes RSVPs with their user", async () => {
    const { ada, eventId } = await seed();
    await insertRsvp(eventId, ada, "confirmed");
    await getPool().query("DELETE FROM users WHERE id = $1", [ada]);
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM rsvps");
    expect(rows[0].n).toBe(0);
  });

  it("keeps the RSVP but clears checked_in_by when the person who checked them in is deleted", async () => {
    const { ada, grace, eventId } = await seed();
    await getPool().query(
      `INSERT INTO rsvps (event_id, user_id, status, checked_in_at, checked_in_by)
       VALUES ($1, $2, 'confirmed', now(), $3)`,
      [eventId, ada, grace],
    );
    await getPool().query("DELETE FROM users WHERE id = $1", [grace]);
    const { rows } = await getPool().query("SELECT checked_in_by FROM rsvps");
    expect(rows).toEqual([{ checked_in_by: null }]);
  });

  it("indexes the event and user lookups", async () => {
    const { rows } = await getPool().query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'rsvps'",
    );
    const defs = rows.map((r) => r.indexdef as string).join("\n");
    expect(defs).toMatch(/\(event_id, status\)|\(event_id\)/);
    expect(defs).toMatch(/\(user_id\)/);
  });
});
