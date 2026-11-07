import { getPool, q, sql, type Queryable } from "@/lib/db";
import { nextAttemptDelayMs } from "@/lib/outbox-backoff";

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

export async function enqueue(
  db: Queryable,
  input: EnqueueInput,
): Promise<boolean> {
  const inserted = await q(db).exec(sql`
    INSERT INTO outbox (channel, kind, payload, dedupe_key, run_after)
    VALUES (${input.channel}, ${input.kind}, ${input.payload}, ${input.dedupeKey ?? null},
            coalesce(${input.runAfter ?? null}, now()))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`);
  return inserted === 1;
}

export async function claimDue(
  limit: number,
  channels: readonly OutboxChannel[],
  db: Queryable = getPool(),
): Promise<OutboxJob[]> {
  if (channels.length === 0) return [];
  const rows = await q(db).many<{
    id: string;
    channel: OutboxChannel;
    kind: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>(sql`
    UPDATE outbox SET attempts = attempts + 1,
                      run_after = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE id IN (
      SELECT id FROM outbox
      WHERE status = 'pending' AND run_after <= now() AND channel = ANY(${channels}::text[])
      ORDER BY run_after, id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, channel, kind, payload, attempts`);
  return rows.map((row) => ({
    id: Number(row.id),
    channel: row.channel,
    kind: row.kind,
    payload: row.payload,
    attempts: row.attempts,
  }));
}

export async function markSent(
  id: number,
  db: Queryable = getPool(),
): Promise<void> {
  await q(db).exec(sql`
    UPDATE outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = ${id}`);
}

export async function markFailed(
  job: Pick<OutboxJob, "id" | "attempts">,
  error: unknown,
  db: Queryable = getPool(),
  permanent = false,
): Promise<"retry" | "dead"> {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 500);
  const delayMs = permanent ? null : nextAttemptDelayMs(job.attempts);
  if (delayMs === null) {
    await q(db).exec(sql`
      UPDATE outbox SET status = 'failed', last_error = ${message} WHERE id = ${job.id}`);
    return "dead";
  }
  await q(db).exec(sql`
    UPDATE outbox SET last_error = ${message}, run_after = now() + make_interval(secs => ${delayMs / 1000})
    WHERE id = ${job.id}`);
  return "retry";
}
