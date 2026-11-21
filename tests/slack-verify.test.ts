import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackSignature } from "@/lib/slack-verify";

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const NOW = 1_800_000_000;
const BODY = "token=xyz&team_id=T1&payload=%7B%7D";

function sign(body: string, timestamp: string, secret = SECRET): string {
  const digest = createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");
  return `v0=${digest}`;
}

function verify(
  overrides: Partial<{
    body: string;
    timestamp: string | null;
    signature: string | null;
    secret: string | undefined;
  }> = {},
): boolean {
  const timestamp =
    "timestamp" in overrides ? overrides.timestamp! : String(NOW);
  const body = overrides.body ?? BODY;
  const signature =
    "signature" in overrides
      ? overrides.signature!
      : sign(BODY, timestamp ?? "");
  const secret = "secret" in overrides ? overrides.secret : SECRET;
  return verifySlackSignature({ body, timestamp, signature }, secret, NOW);
}

describe("verifySlackSignature", () => {
  it("accepts a correct signature", () => {
    expect(verify()).toBe(true);
  });

  it("accepts a timestamp a little under 5 minutes old", () => {
    const ts = String(NOW - 299);
    expect(verify({ timestamp: ts, signature: sign(BODY, ts) })).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(verify({ signature: sign(BODY, String(NOW), "other-secret") })).toBe(
      false,
    );
  });

  it("rejects a body that was changed after signing", () => {
    expect(verify({ body: `${BODY}&extra=1` })).toBe(false);
  });

  it("rejects a missing signature or timestamp header", () => {
    expect(verify({ signature: null })).toBe(false);
    expect(verify({ timestamp: null })).toBe(false);
  });

  it("rejects a 6-minute-old timestamp even when correctly signed", () => {
    const ts = String(NOW - 360);
    expect(verify({ timestamp: ts, signature: sign(BODY, ts) })).toBe(false);
  });

  it("rejects a timestamp from the future beyond the window", () => {
    const ts = String(NOW + 360);
    expect(verify({ timestamp: ts, signature: sign(BODY, ts) })).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(verify({ timestamp: "abc", signature: sign(BODY, "abc") })).toBe(
      false,
    );
  });

  it("rejects everything when no signing secret is configured", () => {
    expect(verify({ secret: undefined })).toBe(false);
    expect(verify({ secret: "" })).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verify({ signature: "v0=abc" })).toBe(false);
  });
});
