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

async function makeEvents(count: number): Promise<number[]> {
  const pool = getPool();
  const org = await pool.query(
    "INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id",
  );
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const { rows } = await pool.query(
      `INSERT INTO events (org_id, slug, title, starts_at, kind)
       VALUES ($1, $2, 'Event', now() + interval '7 days', 'irl') RETURNING id`,
      [org.rows[0].id, `event-${i}`],
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

function insertDomain(
  eventId: number,
  host: string,
  status = "pending",
): Promise<unknown> {
  return getPool().query(
    `INSERT INTO custom_domains (event_id, host, status, expires_at)
     VALUES ($1, $2, $3, now() + interval '90 days')`,
    [eventId, host, status],
  );
}

describe("custom_domains schema", () => {
  it("stores a domain with the columns from AGENTS.md", async () => {
    const [eventId] = await makeEvents(1);
    await insertDomain(eventId, "rsvp.club.org");
    const { rows } = await getPool().query("SELECT * FROM custom_domains");
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "activated_at",
        "cf_hostname_id",
        "created_at",
        "event_id",
        "expires_at",
        "failure_reason",
        "host",
        "id",
        "status",
        "warned_at",
      ].sort(),
    );
    expect(rows[0].status).toBe("pending");
    expect(rows[0].created_at).toBeInstanceOf(Date);
  });

  it("rejects an unknown status", async () => {
    const [eventId] = await makeEvents(1);
    await expect(
      insertDomain(eventId, "rsvp.club.org", "verifying"),
    ).rejects.toThrow(/check/i);
  });

  it.each(["pending", "active"])(
    "allows only one live domain per host (%s)",
    async (status) => {
      const [a, b] = await makeEvents(2);
      await insertDomain(a, "rsvp.club.org", status);
      await expect(insertDomain(b, "rsvp.club.org")).rejects.toThrow(/unique/i);
    },
  );

  it("allows only one live domain per event", async () => {
    const [eventId] = await makeEvents(1);
    await insertDomain(eventId, "rsvp.club.org", "active");
    await expect(insertDomain(eventId, "rsvp2.club.org")).rejects.toThrow(
      /unique/i,
    );
  });

  it.each(["removed", "failed"])(
    "lets a %s domain be added again, to the same or another event",
    async (status) => {
      const [a, b] = await makeEvents(2);
      await insertDomain(a, "rsvp.club.org", status);
      await insertDomain(a, "rsvp.club.org");
      await getPool().query(
        "UPDATE custom_domains SET status = 'removed' WHERE status = 'pending'",
      );
      await insertDomain(b, "rsvp.club.org");
      const { rows } = await getPool().query(
        "SELECT count(*)::int AS n FROM custom_domains WHERE host = 'rsvp.club.org'",
      );
      expect(rows[0].n).toBe(3);
    },
  );

  it("rejects two rows with the same Cloudflare hostname id", async () => {
    const [a, b] = await makeEvents(2);
    await getPool().query(
      `INSERT INTO custom_domains (event_id, host, cf_hostname_id, expires_at)
       VALUES ($1, 'rsvp.club.org', 'cf-1', now() + interval '90 days')`,
      [a],
    );
    await expect(
      getPool().query(
        `INSERT INTO custom_domains (event_id, host, cf_hostname_id, status, expires_at)
         VALUES ($1, 'old.club.org', 'cf-1', 'removed', now() + interval '90 days')`,
        [b],
      ),
    ).rejects.toThrow(/unique/i);
  });

  it("removes an event's domains when the event is deleted", async () => {
    const [eventId] = await makeEvents(1);
    await insertDomain(eventId, "rsvp.club.org");
    await getPool().query("DELETE FROM events WHERE id = $1", [eventId]);
    const { rowCount } = await getPool().query("SELECT 1 FROM custom_domains");
    expect(rowCount).toBe(0);
  });
});
