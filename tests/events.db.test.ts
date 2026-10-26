import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { createEvent, createOrg, listEventsForUser, type NewEvent } from "@/lib/events";
import { upsertUser } from "@/lib/users";
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

async function makeUser(sub = "ident!ada", email = "ada@example.com") {
  const { id } = await upsertUser({ sub, email });
  return id;
}

async function makeOrg(userId: number, slug = "club") {
  const result = await createOrg(userId, { name: "Club", slug });
  if (!result.ok) throw new Error(`org setup failed: ${result.reason}`);
  return result.id;
}

function eventInput(orgId: number, extra: Partial<NewEvent> = {}): NewEvent {
  return {
    orgId,
    slug: "my-event",
    title: "My Event",
    kind: "ysws",
    startsAt: new Date("2026-12-01T10:00:00Z"),
    ...extra,
  };
}

describe("createOrg", () => {
  it("creates the org and makes the creator its owner", async () => {
    const userId = await makeUser();
    const result = await createOrg(userId, { name: "Hack Club HQ", slug: "hack-club-hq" });
    expect(result).toMatchObject({ ok: true, id: expect.any(Number) });
    const { rows } = await getPool().query(
      "SELECT user_id, role FROM org_members WHERE org_id = $1",
      [(result as { id: number }).id],
    );
    expect(rows).toEqual([{ user_id: String(userId), role: "owner" }]);
  });

  it("rejects a blank name", async () => {
    const userId = await makeUser();
    expect(await createOrg(userId, { name: "   ", slug: "hq" })).toEqual({
      ok: false,
      reason: "name",
    });
  });

  it("applies the slug rules", async () => {
    const userId = await makeUser();
    expect(await createOrg(userId, { name: "X", slug: "Bad Slug" })).toEqual({
      ok: false,
      reason: "format",
    });
    expect(await createOrg(userId, { name: "X", slug: "admin" })).toEqual({
      ok: false,
      reason: "reserved",
    });
  });

  it("rejects a slug that is already taken", async () => {
    const userId = await makeUser();
    await makeOrg(userId, "taken-org");
    expect(await createOrg(userId, { name: "Again", slug: "taken-org" })).toEqual({
      ok: false,
      reason: "taken",
    });
  });

  it("leaves no half-created org behind when the slug is taken", async () => {
    const userId = await makeUser();
    await makeOrg(userId, "taken-org");
    await createOrg(userId, { name: "Again", slug: "taken-org" });
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM orgs");
    expect(rows[0].n).toBe(1);
  });
});

describe("createEvent", () => {
  it("creates an event with sensible defaults", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    const result = await createEvent(userId, eventInput(orgId));
    expect(result).toEqual({ ok: true, id: expect.any(Number), slug: "my-event" });
    const { rows } = await getPool().query(
      "SELECT kind, timezone, requires_verification, cancelled_at FROM events WHERE slug = 'my-event'",
    );
    expect(rows[0]).toEqual({
      kind: "ysws",
      timezone: "UTC",
      requires_verification: false,
      cancelled_at: null,
    });
  });

  it("stores the optional fields for an irl event", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    await createEvent(
      userId,
      eventInput(orgId, {
        slug: "meetup-nyc",
        kind: "irl",
        timezone: "America/New_York",
        locationDisplay: "Brooklyn, NY",
        capacity: 40,
        endsAt: new Date("2026-12-01T12:00:00Z"),
      }),
    );
    const { rows } = await getPool().query(
      "SELECT kind, timezone, location_display, capacity FROM events WHERE slug = 'meetup-nyc'",
    );
    expect(rows[0]).toEqual({
      kind: "irl",
      timezone: "America/New_York",
      location_display: "Brooklyn, NY",
      capacity: 40,
    });
  });

  it("rejects a blank title", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    expect(await createEvent(userId, eventInput(orgId, { title: "  " }))).toEqual({
      ok: false,
      reason: "title",
    });
  });

  it("rejects an event that ends before it starts", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    const result = await createEvent(
      userId,
      eventInput(orgId, { endsAt: new Date("2026-11-30T10:00:00Z") }),
    );
    expect(result).toEqual({ ok: false, reason: "dates" });
  });

  it("applies the slug rules", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    expect(await createEvent(userId, eventInput(orgId, { slug: "ab" }))).toEqual({
      ok: false,
      reason: "format",
    });
    expect(await createEvent(userId, eventInput(orgId, { slug: "events" }))).toEqual({
      ok: false,
      reason: "reserved",
    });
  });

  it("rejects a slug that is already taken, even by another org", async () => {
    const ada = await makeUser();
    const grace = await makeUser("ident!grace", "grace@example.com");
    const adaOrg = await makeOrg(ada, "ada-club");
    const graceOrg = await makeOrg(grace, "grace-club");
    await createEvent(ada, eventInput(adaOrg));
    expect(await createEvent(grace, eventInput(graceOrg))).toEqual({
      ok: false,
      reason: "taken",
    });
  });

  it("refuses a user who is not a member of the org", async () => {
    const ada = await makeUser();
    const grace = await makeUser("ident!grace", "grace@example.com");
    const adaOrg = await makeOrg(ada);
    expect(await createEvent(grace, eventInput(adaOrg))).toEqual({
      ok: false,
      reason: "not_member",
    });
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM events");
    expect(rows[0].n).toBe(0);
  });

  it("survives two simultaneous creates with the same slug", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    const results = await Promise.all([
      createEvent(userId, eventInput(orgId)),
      createEvent(userId, eventInput(orgId)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "taken" }]);
  });
});

describe("listEventsForUser", () => {
  it("lists only events from the user's orgs, soonest first", async () => {
    const ada = await makeUser();
    const grace = await makeUser("ident!grace", "grace@example.com");
    const adaOrg = await makeOrg(ada, "ada-club");
    const graceOrg = await makeOrg(grace, "grace-club");
    await createEvent(
      ada,
      eventInput(adaOrg, { slug: "later", startsAt: new Date("2026-12-20T10:00:00Z") }),
    );
    await createEvent(
      ada,
      eventInput(adaOrg, { slug: "sooner", startsAt: new Date("2026-12-02T10:00:00Z") }),
    );
    await createEvent(grace, eventInput(graceOrg, { slug: "not-yours" }));

    const events = await listEventsForUser(ada);
    expect(events.map((e) => e.slug)).toEqual(["sooner", "later"]);
    expect(events[0]).toMatchObject({
      id: expect.any(Number),
      title: "My Event",
      kind: "ysws",
      orgName: "Club",
      cancelled: false,
    });
    expect(events[0].startsAt).toBeInstanceOf(Date);
  });

  it("marks cancelled events", async () => {
    const userId = await makeUser();
    const orgId = await makeOrg(userId);
    await createEvent(userId, eventInput(orgId));
    await getPool().query("UPDATE events SET cancelled_at = now()");
    expect((await listEventsForUser(userId))[0].cancelled).toBe(true);
  });

  it("returns an empty list for a user with no orgs", async () => {
    const userId = await makeUser();
    expect(await listEventsForUser(userId)).toEqual([]);
  });
});
