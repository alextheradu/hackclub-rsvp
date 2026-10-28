import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool, withTx } from "@/lib/db";
import { MAX_ATTEMPTS } from "@/lib/outbox-backoff";
import { claimDue, enqueue, markFailed, markSent } from "@/lib/outbox";
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

const job = { channel: "email", kind: "rsvp_confirmed", payload: { rsvpId: 1 } } as const;

function row(id: number) {
  return getPool()
    .query("SELECT * FROM outbox WHERE id = $1", [id])
    .then((r) => r.rows[0]);
}

describe("enqueue", () => {
  it("inserts a pending row due now", async () => {
    expect(await enqueue(getPool(), job)).toBe(true);
    const { rows } = await getPool().query("SELECT * FROM outbox");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].payload).toEqual({ rsvpId: 1 });
  });

  it("ignores a duplicate dedupe key", async () => {
    expect(await enqueue(getPool(), { ...job, dedupeKey: "rsvp-confirmed:1" })).toBe(true);
    expect(await enqueue(getPool(), { ...job, dedupeKey: "rsvp-confirmed:1" })).toBe(false);
    const { rows } = await getPool().query("SELECT 1 FROM outbox");
    expect(rows).toHaveLength(1);
  });

  it("allows many rows without a dedupe key", async () => {
    await enqueue(getPool(), job);
    await enqueue(getPool(), job);
    const { rows } = await getPool().query("SELECT 1 FROM outbox");
    expect(rows).toHaveLength(2);
  });

  it("rolls back with the surrounding transaction", async () => {
    await expect(
      withTx(async (client) => {
        await enqueue(client, job);
        throw new Error("rsvp failed");
      }),
    ).rejects.toThrow("rsvp failed");
    const { rows } = await getPool().query("SELECT 1 FROM outbox");
    expect(rows).toHaveLength(0);
  });
});

describe("claimDue", () => {
  it("claims due jobs, counts the attempt, and leases them", async () => {
    await enqueue(getPool(), job);
    const claimed = await claimDue(10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].attempts).toBe(1);
    expect(claimed[0].payload).toEqual({ rsvpId: 1 });
    expect(await claimDue(10)).toHaveLength(0);
  });

  it("skips jobs scheduled for later", async () => {
    await enqueue(getPool(), { ...job, runAfter: new Date(Date.now() + 60_000) });
    expect(await claimDue(10)).toHaveLength(0);
  });

  it("respects the limit and claims oldest first", async () => {
    await enqueue(getPool(), { ...job, payload: { n: 1 } });
    await enqueue(getPool(), { ...job, payload: { n: 2 } });
    await enqueue(getPool(), { ...job, payload: { n: 3 } });
    const claimed = await claimDue(2);
    expect(claimed.map((j) => j.payload.n)).toEqual([1, 2]);
  });

  it("never hands the same job to two concurrent workers", async () => {
    for (let i = 0; i < 6; i++) await enqueue(getPool(), { ...job, payload: { n: i } });
    const batches = await Promise.all([claimDue(6), claimDue(6), claimDue(6)]);
    const ids = batches.flat().map((j) => j.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });
});

describe("markSent / markFailed", () => {
  it("marks a job sent and never claims it again", async () => {
    await enqueue(getPool(), job);
    const [claimed] = await claimDue(1);
    await markSent(claimed.id);
    const stored = await row(claimed.id);
    expect(stored.status).toBe("sent");
    expect(stored.sent_at).not.toBeNull();
    expect(await claimDue(10)).toHaveLength(0);
  });

  it("schedules a retry with backoff and records the error", async () => {
    await enqueue(getPool(), job);
    const [claimed] = await claimDue(1);
    expect(await markFailed(claimed, new Error("smtp down"))).toBe("retry");
    const stored = await row(claimed.id);
    expect(stored.status).toBe("pending");
    expect(stored.last_error).toBe("smtp down");
    const waitMs = new Date(stored.run_after).getTime() - Date.now();
    expect(waitMs).toBeGreaterThan(20_000);
    expect(waitMs).toBeLessThan(40_000);
  });

  it("dead-letters a job once attempts run out", async () => {
    await enqueue(getPool(), job);
    const [claimed] = await claimDue(1);
    expect(await markFailed({ id: claimed.id, attempts: MAX_ATTEMPTS }, "boom")).toBe("dead");
    const stored = await row(claimed.id);
    expect(stored.status).toBe("failed");
    expect(stored.last_error).toBe("boom");
    expect(await claimDue(10)).toHaveLength(0);
  });
});
