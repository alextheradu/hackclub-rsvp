import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/session";

const SECRET = "test-secret-at-least-32-characters-long";
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

describe("session cookie", () => {
  it("round-trips a valid token", () => {
    const token = signSession({ uid: 42 }, SECRET, T0);
    expect(verifySession(token, SECRET, T0 + DAY)).toEqual({ uid: 42 });
  });

  it("rejects a tampered payload", () => {
    const [, ...rest] = signSession({ uid: 42 }, SECRET, T0).split(".");
    const forged = [
      Buffer.from(JSON.stringify({ uid: 1 })).toString("base64url"),
      ...rest,
    ].join(".");
    expect(verifySession(forged, SECRET, T0)).toBeNull();
  });

  it("rejects a tampered expiry", () => {
    const [payload, , sig] = signSession({ uid: 42 }, SECRET, T0).split(".");
    const forged = [payload, String(T0 + 3650 * DAY), sig].join(".");
    expect(verifySession(forged, SECRET, T0 + 31 * DAY)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signSession({ uid: 42 }, "another-secret-another-secret-123456", T0);
    expect(verifySession(token, SECRET, T0)).toBeNull();
  });

  it("expires after 30 days", () => {
    const token = signSession({ uid: 42 }, SECRET, T0);
    expect(verifySession(token, SECRET, T0 + 30 * DAY - 1)).toEqual({ uid: 42 });
    expect(verifySession(token, SECRET, T0 + 30 * DAY)).toBeNull();
  });

  it.each([
    ["empty string", ""],
    ["one segment", "abc"],
    ["two segments", "a.b"],
    ["four segments", "a.b.c.d"],
    ["not base64", "!!!.???.***"],
    ["non-numeric expiry", "eyJ1aWQiOjF9.soon.abc"],
  ])("returns null without throwing for malformed input: %s", (_name, input) => {
    expect(() => verifySession(input, SECRET, T0)).not.toThrow();
    expect(verifySession(input, SECRET, T0)).toBeNull();
  });

  it("returns null when the signature has the wrong length", () => {
    const [payload, expiry] = signSession({ uid: 42 }, SECRET, T0).split(".");
    expect(verifySession(`${payload}.${expiry}.AAAA`, SECRET, T0)).toBeNull();
  });
});
