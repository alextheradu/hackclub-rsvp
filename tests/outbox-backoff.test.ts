import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextAttemptDelayMs } from "@/lib/outbox-backoff";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe("nextAttemptDelayMs", () => {
  it("retries a first failure after 30 seconds", () => {
    expect(nextAttemptDelayMs(1)).toBe(30 * SECOND);
  });

  it("doubles the delay after each failure", () => {
    expect(nextAttemptDelayMs(2)).toBe(60 * SECOND);
    expect(nextAttemptDelayMs(3)).toBe(2 * MINUTE);
    expect(nextAttemptDelayMs(4)).toBe(4 * MINUTE);
    expect(nextAttemptDelayMs(5)).toBe(8 * MINUTE);
  });

  it("never waits longer than an hour", () => {
    for (let attempts = 1; attempts < MAX_ATTEMPTS; attempts++) {
      expect(nextAttemptDelayMs(attempts)).toBeLessThanOrEqual(60 * MINUTE);
    }
  });

  it("never gets shorter as failures pile up", () => {
    let previous = 0;
    for (let attempts = 1; attempts < MAX_ATTEMPTS; attempts++) {
      const delay = nextAttemptDelayMs(attempts) as number;
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it("gives up once the attempts are used up", () => {
    expect(nextAttemptDelayMs(MAX_ATTEMPTS - 1)).not.toBeNull();
    expect(nextAttemptDelayMs(MAX_ATTEMPTS)).toBeNull();
    expect(nextAttemptDelayMs(MAX_ATTEMPTS + 10)).toBeNull();
  });

  it("allows 8 attempts in total", () => {
    expect(MAX_ATTEMPTS).toBe(8);
  });

  it("rejects attempt counts that cannot happen", () => {
    expect(() => nextAttemptDelayMs(0)).toThrow(RangeError);
    expect(() => nextAttemptDelayMs(-1)).toThrow(RangeError);
    expect(() => nextAttemptDelayMs(1.5)).toThrow(RangeError);
    expect(() => nextAttemptDelayMs(Number.NaN)).toThrow(RangeError);
  });
});
