import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { enqueue, type OutboxJob } from "@/lib/outbox";
import { runOutboxOnce } from "@/lib/outbox-worker";
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

async function statuses() {
  const { rows } = await getPool().query("SELECT channel, status, last_error FROM outbox ORDER BY id");
  return rows;
}

describe("runOutboxOnce", () => {
  it("sends due jobs and marks them sent", async () => {
    await enqueue(getPool(), { channel: "email", kind: "rsvp_confirmed", payload: { rsvpId: 7 } });
    const seen: OutboxJob[] = [];
    const result = await runOutboxOnce({ email: async (job) => void seen.push(job) });
    expect(result).toEqual({ sent: 1, retried: 0, dead: 0 });
    expect(seen[0].payload).toEqual({ rsvpId: 7 });
    expect((await statuses())[0].status).toBe("sent");
  });

  it("schedules a retry when the sender throws", async () => {
    await enqueue(getPool(), { channel: "email", kind: "rsvp_confirmed", payload: {} });
    const result = await runOutboxOnce({
      email: async () => {
        throw new Error("smtp timeout");
      },
    });
    expect(result).toEqual({ sent: 0, retried: 1, dead: 0 });
    const [row] = await statuses();
    expect(row.status).toBe("pending");
    expect(row.last_error).toBe("smtp timeout");
  });

  it("keeps going after one job fails", async () => {
    await enqueue(getPool(), { channel: "email", kind: "a", payload: { ok: false } });
    await enqueue(getPool(), { channel: "email", kind: "b", payload: { ok: true } });
    const result = await runOutboxOnce({
      email: async (job) => {
        if (!job.payload.ok) throw new Error("nope");
      },
    });
    expect(result).toEqual({ sent: 1, retried: 1, dead: 0 });
  });

  it("leaves jobs alone when their channel has no sender", async () => {
    await enqueue(getPool(), { channel: "slack", kind: "dm", payload: {} });
    const result = await runOutboxOnce({ email: async () => {} });
    expect(result).toEqual({ sent: 0, retried: 0, dead: 0 });
    const { rows } = await getPool().query("SELECT attempts, status FROM outbox");
    expect(rows[0]).toEqual({ attempts: 0, status: "pending" });
  });
});
