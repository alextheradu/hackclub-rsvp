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

export const RATE_LIMIT_MESSAGE =
  "You've been rate-limited. Please wait a minute or more and try again.";

// Every request reaches the app through the Cloudflare Tunnel, so this header
// is the real visitor. Don't trust it on a server people can reach directly.
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

export function tooManyRequests(retryAfterSeconds = 60): Response {
  return new Response(RATE_LIMIT_MESSAGE, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
