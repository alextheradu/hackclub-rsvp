import { describe, expect, it } from "vitest";
import { dateTile, formatEventWhen, timeAgo } from "@/lib/format";

describe("formatEventWhen", () => {
  it("shows a start with its timezone abbreviation", () => {
    expect(
      formatEventWhen(
        new Date("2026-12-01T23:30:00Z"),
        null,
        "America/New_York",
      ),
    ).toBe("Tue, Dec 1, 2026 · 6:30 PM EST");
  });

  it("shows a same-day end as a time range", () => {
    expect(
      formatEventWhen(
        new Date("2026-12-01T23:30:00Z"),
        new Date("2026-12-02T01:30:00Z"),
        "America/New_York",
      ),
    ).toBe("Tue, Dec 1, 2026 · 6:30 PM – 8:30 PM EST");
  });

  it("shows both dates when the event spans days", () => {
    expect(
      formatEventWhen(
        new Date("2026-12-01T23:30:00Z"),
        new Date("2026-12-03T15:00:00Z"),
        "America/New_York",
      ),
    ).toBe("Tue, Dec 1, 2026 · 6:30 PM EST to Thu, Dec 3, 2026 · 10:00 AM EST");
  });

  it("uses the event's timezone, not the server's", () => {
    expect(
      formatEventWhen(new Date("2026-12-01T10:00:00Z"), null, "Asia/Kolkata"),
    ).toContain("3:30 PM");
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(
      formatEventWhen(new Date("2026-12-01T10:00:00Z"), null, "Mars/Olympus"),
    ).toBe("Tue, Dec 1, 2026 · 10:00 AM UTC");
  });
});

describe("dateTile", () => {
  it("splits a date into tile parts in the event's timezone", () => {
    expect(
      dateTile(new Date("2026-12-01T03:30:00Z"), "America/New_York"),
    ).toEqual({
      weekday: "Mon",
      month: "Nov",
      day: "30",
      year: "2026",
      time: "10:30 PM",
      zone: "EST",
    });
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(
      dateTile(new Date("2026-12-01T03:30:00Z"), "Not/AZone"),
    ).toMatchObject({
      month: "Dec",
      day: "1",
      zone: "UTC",
    });
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-11-03T18:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it("counts up through minutes, hours and days", () => {
    expect(timeAgo(ago(10), now)).toBe("just now");
    expect(timeAgo(ago(5 * 60), now)).toBe("5m ago");
    expect(timeAgo(ago(3 * 3600), now)).toBe("3h ago");
    expect(timeAgo(ago(2 * 86400), now)).toBe("2d ago");
  });

  it("switches to a date after a week, in the given timezone", () => {
    expect(
      timeAgo(new Date("2026-10-01T02:00:00Z"), now, "America/New_York"),
    ).toBe("Sep 30");
  });

  it("treats future dates as just now", () => {
    expect(timeAgo(ago(-60), now)).toBe("just now");
  });
});
