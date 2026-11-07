export type Eligibility = "eligible" | "not_eligible" | "unknown";

const NOT_ELIGIBLE_RESULTS = new Set([
  "verified_but_over_18",
  "rejected",
  "needs_submission",
  "pending",
]);

// Network errors and non-2xx responses throw, so the outbox retries later.
export async function checkEligibility(slackId: string): Promise<Eligibility> {
  const url = new URL("https://auth.hackclub.com/api/external/check");
  url.searchParams.set("slack_id", slackId);
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HCA eligibility check failed: ${res.status}`);
  const body = (await res.json()) as { result?: unknown };
  if (typeof body.result !== "string") return "unknown";
  if (body.result === "verified_eligible") return "eligible";
  return NOT_ELIGIBLE_RESULTS.has(body.result) ? "not_eligible" : "unknown";
}
