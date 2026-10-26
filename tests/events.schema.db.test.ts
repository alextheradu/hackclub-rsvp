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

async function createOrg() {
  const { rows } = await getPool().query(
    "INSERT INTO orgs (name, slug) VALUES ('Club', 'club') RETURNING id",
  );
  return rows[0].id as string;
}

async function insertEvent(orgId: string, extra: Record<string, unknown> = {}) {
  const row = {
    org_id: orgId,
    slug: "my-event",
    title: "My Event",
    starts_at: "2026-12-01T10:00:00Z",
    kind: "ysws",
    ...extra,
  };
  const keys = Object.keys(row);
  return getPool().query(
    `INSERT INTO events (${keys.join(", ")})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING *`,
    Object.values(row),
  );
}

describe("events schema (migration 002)", () => {
  it("has the new event columns", async () => {
    const { rows } = await getPool().query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'events'`,
    );
    const columns = rows.map((r) => r.column_name);
    for (const name of [
      "kind",
      "timezone",
      "online_url",
      "location_display",
      "cancelled_at",
      "requires_verification",
      "slack_channel_id",
      "website",
    ]) {
      expect(columns).toContain(name);
    }
  });

  it("accepts both event kinds", async () => {
    const orgId = await createOrg();
    await expect(insertEvent(orgId, { slug: "a-ysws", kind: "ysws" })).resolves.toBeDefined();
    await expect(insertEvent(orgId, { slug: "an-irl", kind: "irl" })).resolves.toBeDefined();
  });

  it("rejects an unknown kind", async () => {
    const orgId = await createOrg();
    await expect(insertEvent(orgId, { kind: "party" })).rejects.toThrow();
  });

  it("requires a kind", async () => {
    const orgId = await createOrg();
    await expect(
      getPool().query(
        `INSERT INTO events (org_id, slug, title, starts_at)
         VALUES ($1, 'no-kind', 'No kind', now())`,
        [orgId],
      ),
    ).rejects.toThrow();
  });

  it("defaults timezone to UTC, requires_verification to false, cancelled_at to null", async () => {
    const orgId = await createOrg();
    const { rows } = await insertEvent(orgId);
    expect(rows[0]).toMatchObject({
      timezone: "UTC",
      requires_verification: false,
      cancelled_at: null,
      online_url: null,
      location_display: null,
      slack_channel_id: null,
      website: null,
    });
  });
});
