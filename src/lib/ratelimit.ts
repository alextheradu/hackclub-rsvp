import { q, sql } from "@/lib/db";

export type RateLimitResults = { allowed: boolean; remaining: number };

export async function hit(
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<RateLimitResults> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(
    Math.floor(now.getTime() / windowMs) * windowMs,
  );

  const { count } = await q().one<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);

  return { allowed: count <= limit, remaining: Math.max(limit - count, 0) };
}
