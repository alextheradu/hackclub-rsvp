import { createHmac, timingSafeEqual } from "node:crypto";

// Slack's docs reject requests more than five minutes from local time.
const MAX_AGE_SECONDS = 5 * 60;

export type SlackRequestParts = {
  body: string;
  timestamp: string | null;
  signature: string | null;
};

export function verifySlackSignature(
  req: SlackRequestParts,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !req.timestamp || !req.signature) return false;
  if (!/^\d+$/.test(req.timestamp)) return false;
  if (Math.abs(nowSeconds - Number(req.timestamp)) > MAX_AGE_SECONDS) {
    return false;
  }
  const expected = Buffer.from(
    "v0=" +
      createHmac("sha256", secret)
        .update(`v0:${req.timestamp}:${req.body}`)
        .digest("hex"),
  );
  const given = Buffer.from(req.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function verifySlackRequest(request: Request, body: string): boolean {
  return verifySlackSignature(
    {
      body,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
    },
    process.env.SLACK_SIGNING_SECRET,
  );
}
