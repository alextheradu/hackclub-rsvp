import { claimDue, markFailed, markSent, type OutboxChannel, type OutboxJob } from "@/lib/outbox";

export type Sender = (job: OutboxJob) => Promise<void>;
export type Senders = Partial<Record<OutboxChannel, Sender>>;

export type RunResult = { sent: number; retried: number; dead: number };

export async function runOutboxOnce(senders: Senders, limit = 20): Promise<RunResult> {
  const channels = (Object.keys(senders) as OutboxChannel[]).filter((c) => senders[c]);
  const jobs = await claimDue(limit, channels);
  const result: RunResult = { sent: 0, retried: 0, dead: 0 };

  for (const job of jobs) {
    try {
      await senders[job.channel]!(job);
      await markSent(job.id);
      result.sent++;
    } catch (error) {
      const outcome = await markFailed(job, error);
      if (outcome === "retry") result.retried++;
      else result.dead++;
    }
  }
  return result;
}

const globalForWorker = globalThis as unknown as { __outboxTimer?: NodeJS.Timeout };

export function startOutboxWorker(senders: Senders, intervalMs = 10_000): void {
  if (globalForWorker.__outboxTimer) return;
  let running = false;
  globalForWorker.__outboxTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { sent, retried, dead } = await runOutboxOnce(senders);
      if (retried || dead) console.warn(`outbox: ${sent} sent, ${retried} retrying, ${dead} dead`);
    } catch (error) {
      console.error("outbox: run failed", error);
    } finally {
      running = false;
    }
  }, intervalMs);
  globalForWorker.__outboxTimer.unref();
}
