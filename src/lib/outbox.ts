import type { Pool, PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { nextAttemptDelayMs } from "@/lib/outbox-backoff";

type Queryable = Pick<Pool | PoolClient, "query">;

export type OutboxChannel = "email" | "slack";

export type OutboxJob = {
  id: number;
  channel: OutboxChannel;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type EnqueueInput = {
  channel: OutboxChannel;
  kind: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  runAfter?: Date;
};

const LEASE_SECONDS = 300;

export async function enqueue(db: Queryable, input: EnqueueInput): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO outbox (channel, kind, payload, dedupe_key, run_after)
     VALUES ($1, $2, $3, $4, coalesce($5, now()))
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [input.channel, input.kind, input.payload, input.dedupeKey ?? null, input.runAfter ?? null],
  );
  return rowCount === 1;
}

export async function claimDue(limit: number, db: Queryable = getPool()): Promise<OutboxJob[]> {
  const { rows } = await db.query(
    `UPDATE outbox SET attempts = attempts + 1,
                       run_after = now() + make_interval(secs => $2)
     WHERE id IN (
       SELECT id FROM outbox
       WHERE status = 'pending' AND run_after <= now()
       ORDER BY run_after, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, channel, kind, payload, attempts`,
    [limit, LEASE_SECONDS],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    channel: row.channel,
    kind: row.kind,
    payload: row.payload,
    attempts: row.attempts,
  }));
}

export async function markSent(id: number, db: Queryable = getPool()): Promise<void> {
  await db.query(
    "UPDATE outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1",
    [id],
  );
}

export async function markFailed(
  job: Pick<OutboxJob, "id" | "attempts">,
  error: unknown,
  db: Queryable = getPool(),
): Promise<"retry" | "dead"> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const delayMs = nextAttemptDelayMs(job.attempts);
  if (delayMs === null) {
    await db.query("UPDATE outbox SET status = 'failed', last_error = $2 WHERE id = $1", [
      job.id,
      message,
    ]);
    return "dead";
  }
  await db.query(
    `UPDATE outbox SET last_error = $2, run_after = now() + make_interval(secs => $3)
     WHERE id = $1`,
    [job.id, message, delayMs / 1000],
  );
  return "retry";
}
