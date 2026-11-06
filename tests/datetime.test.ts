import { describe, expect, it } from "vitest";
import { parseLocalDateTime, toLocalDateTime } from "@/lib/datetime";

const utc = (iso: string) => new Date(iso);

describe("parseLocalDateTime", () => {
  it.each([
    ["2026-12-01T10:00", "UTC", "2026-12-01T10:00:00Z"],
    ["2026-12-01T10:00", "America/New_York", "2026-12-01T15:00:00Z"],
    ["2026-07-01T10:00", "America/New_York", "2026-07-01T14:00:00Z"],
    ["2026-12-01T10:00", "Europe/London", "2026-12-01T10:00:00Z"],
    ["2026-07-01T10:00", "Europe/London", "2026-07-01T09:00:00Z"],
    ["2026-12-01T10:00", "Asia/Kolkata", "2026-12-01T04:30:00Z"],
  ])("reads %s in %s", (local, zone, expected) => {
    expect(parseLocalDateTime(local, zone)).toEqual(utc(expected));
  });

  it("handles the minutes just before and after a spring-forward jump", () => {
    expect(parseLocalDateTime("2026-03-08T01:59", "America/New_York")).toEqual(
      utc("2026-03-08T06:59:00Z"),
    );
    expect(parseLocalDateTime("2026-03-08T03:00", "America/New_York")).toEqual(
      utc("2026-03-08T07:00:00Z"),
    );
  });

  it("rejects a local time that does not exist (skipped by DST)", () => {
    expect(
      parseLocalDateTime("2026-03-08T02:30", "America/New_York"),
    ).toBeNull();
  });

  it("picks the earlier moment when a local time happens twice (DST ends)", () => {
    expect(parseLocalDateTime("2026-11-01T01:30", "America/New_York")).toEqual(
      utc("2026-11-01T05:30:00Z"),
    );
  });

  it("rejects an unknown timezone", () => {
    expect(parseLocalDateTime("2026-12-01T10:00", "Mars/Olympus")).toBeNull();
    expect(parseLocalDateTime("2026-12-01T10:00", "")).toBeNull();
  });

  it.each([
    ["not a date"],
    [""],
    ["2026-12-01"],
    ["2026-12-01 10:00"],
    ["2026-13-01T10:00"],
    ["2026-02-30T10:00"],
    ["2026-12-01T25:00"],
    ["2026-12-01T10:60"],
  ])("rejects the malformed value %j", (local) => {
    expect(parseLocalDateTime(local, "UTC")).toBeNull();
  });
});

describe("toLocalDateTime", () => {
  it("formats the wall-clock time in the timezone", () => {
    expect(
      toLocalDateTime(new Date("2026-11-21T14:00:00Z"), "America/New_York"),
    ).toBe("2026-11-21T09:00");
  });

  it("formats midnight as 00, not 24", () => {
    expect(
      toLocalDateTime(new Date("2026-12-01T05:00:00Z"), "America/New_York"),
    ).toBe("2026-12-01T00:00");
  });

  it("round-trips with parseLocalDateTime", () => {
    for (const local of [
      "2026-03-08T01:30",
      "2026-07-04T18:45",
      "2027-01-01T00:00",
    ]) {
      const date = parseLocalDateTime(local, "America/Los_Angeles")!;
      expect(toLocalDateTime(date, "America/Los_Angeles")).toBe(local);
    }
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(toLocalDateTime(new Date("2026-11-21T14:00:00Z"), "Not/AZone")).toBe(
      "2026-11-21T14:00",
    );
  });
});
