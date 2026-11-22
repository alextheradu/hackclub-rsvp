import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CloudflareError } from "@/lib/cloudflare";
import { closePool, getPool } from "@/lib/db";
import { addDomain } from "@/lib/domains";
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
  const { rows } = await pool.query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind)
     SELECT $1, 'event-' || n, 'Event ' || n, now() + interval '7 days', 'irl'
     FROM generate_series(1, $2::int) AS n
     ORDER BY n
     RETURNING id`,
    [org.rows[0].id, count],
  );
  return rows.map((row) => Number(row.id));
}

// Fills `count` live slots using events from the end of the list.
async function fillLive(eventIds: number[], count: number) {
  const ids = eventIds.slice(-count);
  await getPool().query(
    `INSERT INTO custom_domains (event_id, host, status, expires_at)
     SELECT id, 'rsvp' || id || '.filler.org',
            CASE WHEN id % 2 = 0 THEN 'active' ELSE 'pending' END,
            now() + interval '90 days'
     FROM unnest($1::bigint[]) AS id`,
    [ids],
  );
}

function fakeCloudflare(delayMs = 0) {
  const created: string[] = [];
  const createHostname = vi.fn(async (host: string) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    created.push(host);
    return { id: randomUUID() };
  });
  return { created, cloudflare: { createHostname } };
}

async function liveCount(): Promise<number> {
  const { rows } = await getPool().query(
    "SELECT count(*)::int AS n FROM custom_domains WHERE status IN ('pending', 'active')",
  );
  return rows[0].n;
}

describe("addDomain", () => {
  it("validates the host, registers it with Cloudflare and stores it pending", async () => {
    const [eventId] = await makeEvents(1);
    const cf = fakeCloudflare();
    const result = await addDomain(eventId, "  RSVP.Club.ORG. ", cf);
    expect(result).toEqual({
      ok: true,
      id: expect.any(Number),
      host: "rsvp.club.org",
    });
    expect(cf.created).toEqual(["rsvp.club.org"]);
    const { rows } = await getPool().query(
      `SELECT event_id, host, status, cf_hostname_id,
              expires_at - created_at AS ttl
       FROM custom_domains`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_id: String(eventId),
      host: "rsvp.club.org",
      status: "pending",
    });
    expect(rows[0].cf_hostname_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].ttl).toMatchObject({ days: 90 });
  });

  it("uses the configured TTL", async () => {
    const [eventId] = await makeEvents(1);
    await addDomain(eventId, "rsvp.club.org", {
      ...fakeCloudflare(),
      ttlDays: 30,
    });
    const { rows } = await getPool().query(
      "SELECT expires_at - created_at AS ttl FROM custom_domains",
    );
    expect(rows[0].ttl).toMatchObject({ days: 30 });
  });

  it.each([
    ["club.org", "apex"],
    ["1.2.3.4", "ip"],
    ["foo.hackclub.rsvp", "reserved"],
    ["https://rsvp.club.org", "format"],
  ])("rejects %j as %s without calling Cloudflare", async (raw, reason) => {
    const [eventId] = await makeEvents(1);
    const cf = fakeCloudflare();
    expect(await addDomain(eventId, raw, cf)).toEqual({ ok: false, reason });
    expect(cf.cloudflare.createHostname).not.toHaveBeenCalled();
    expect(await liveCount()).toBe(0);
  });

  it("rejects an unknown event", async () => {
    const cf = fakeCloudflare();
    expect(await addDomain(999999, "rsvp.club.org", cf)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(cf.cloudflare.createHostname).not.toHaveBeenCalled();
  });

  it("rejects a second live domain for the same event", async () => {
    const [eventId] = await makeEvents(1);
    const cf = fakeCloudflare();
    await addDomain(eventId, "rsvp.club.org", cf);
    expect(await addDomain(eventId, "rsvp2.club.org", cf)).toEqual({
      ok: false,
      reason: "event_has_domain",
    });
    expect(cf.created).toEqual(["rsvp.club.org"]);
  });

  it("rejects a host another event is already using", async () => {
    const [a, b] = await makeEvents(2);
    const cf = fakeCloudflare();
    await addDomain(a, "rsvp.club.org", cf);
    expect(await addDomain(b, "RSVP.club.org", cf)).toEqual({
      ok: false,
      reason: "host_taken",
    });
    expect(cf.created).toEqual(["rsvp.club.org"]);
  });

  it("lets a removed domain be added again", async () => {
    const [a, b] = await makeEvents(2);
    const cf = fakeCloudflare();
    await addDomain(a, "rsvp.club.org", cf);
    await getPool().query("UPDATE custom_domains SET status = 'removed'");
    expect(await addDomain(b, "rsvp.club.org", cf)).toMatchObject({
      ok: true,
    });
    expect(await addDomain(a, "rsvp2.club.org", cf)).toMatchObject({
      ok: true,
    });
  });

  describe("the live-domain cap", () => {
    it("rejects the 91st live domain", async () => {
      const events = await makeEvents(91);
      await fillLive(events, 90);
      const cf = fakeCloudflare();
      expect(await addDomain(events[0], "rsvp.club.org", cf)).toEqual({
        ok: false,
        reason: "cap_reached",
      });
      expect(cf.cloudflare.createHostname).not.toHaveBeenCalled();
      expect(await liveCount()).toBe(90);
    });

    it("admits the 90th live domain", async () => {
      const events = await makeEvents(90);
      await fillLive(events, 89);
      expect(
        await addDomain(events[0], "rsvp.club.org", fakeCloudflare()),
      ).toMatchObject({ ok: true });
      expect(await liveCount()).toBe(90);
    });

    it("uses the configured maximum", async () => {
      const events = await makeEvents(3);
      await fillLive(events, 2);
      expect(
        await addDomain(events[0], "rsvp.club.org", {
          ...fakeCloudflare(),
          maxDomains: 2,
        }),
      ).toEqual({ ok: false, reason: "cap_reached" });
    });

    it.each(["removed", "failed"])(
      "doesn't count %s domains, so they free a slot",
      async (status) => {
        const events = await makeEvents(91);
        await fillLive(events, 90);
        await getPool().query(
          "UPDATE custom_domains SET status = $1 WHERE event_id = $2",
          [status, events[90]],
        );
        expect(
          await addDomain(events[0], "rsvp.club.org", fakeCloudflare()),
        ).toMatchObject({ ok: true });
      },
    );

    it("20 parallel adds at 89 live domains admit exactly 1", async () => {
      const events = await makeEvents(109);
      await fillLive(events, 89);
      const cf = fakeCloudflare(20);
      const results = await Promise.all(
        events
          .slice(0, 20)
          .map((eventId, i) => addDomain(eventId, `rsvp${i}.club.org`, cf)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(
        results.filter((r) => !r.ok && r.reason === "cap_reached"),
      ).toHaveLength(19);
      expect(cf.cloudflare.createHostname).toHaveBeenCalledTimes(1);
      expect(await liveCount()).toBe(90);
    });
  });

  describe("when Cloudflare fails", () => {
    it("leaves no row behind and reports the failure", async () => {
      const [eventId] = await makeEvents(1);
      const createHostname = vi.fn(async () => {
        throw new CloudflareError("POST failed with HTTP 500", 500, [], true);
      });
      expect(
        await addDomain(eventId, "rsvp.club.org", {
          cloudflare: { createHostname },
        }),
      ).toEqual({ ok: false, reason: "cloudflare_error" });
      const { rowCount } = await getPool().query(
        "SELECT 1 FROM custom_domains",
      );
      expect(rowCount).toBe(0);
    });

    it("doesn't use up a slot", async () => {
      const events = await makeEvents(90);
      await fillLive(events, 89);
      const failing = vi.fn(async () => {
        throw new CloudflareError("POST failed with HTTP 500", 500, [], true);
      });
      await addDomain(events[0], "rsvp.club.org", {
        cloudflare: { createHostname: failing },
      });
      expect(
        await addDomain(events[0], "rsvp.club.org", fakeCloudflare()),
      ).toMatchObject({ ok: true });
    });

    it("rethrows errors that aren't from Cloudflare", async () => {
      const [eventId] = await makeEvents(1);
      const createHostname = vi.fn(async () => {
        throw new TypeError("bug");
      });
      await expect(
        addDomain(eventId, "rsvp.club.org", {
          cloudflare: { createHostname },
        }),
      ).rejects.toThrow("bug");
    });
  });
});
