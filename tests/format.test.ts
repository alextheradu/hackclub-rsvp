import { describe, expect, it } from "vitest";
import { formatEventWhen } from "@/lib/format";

describe("formatEventWhen", () => {
  it("shows a start with its timezone abbreviation", () => {
    expect(formatEventWhen(new Date("2026-12-01T23:30:00Z"), null, "America/New_York")).toBe(
      "Tue, Dec 1, 2026 · 6:30 PM EST",
    );
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
    expect(formatEventWhen(new Date("2026-12-01T10:00:00Z"), null, "Asia/Kolkata")).toContain(
      "3:30 PM",
    );
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(formatEventWhen(new Date("2026-12-01T10:00:00Z"), null, "Mars/Olympus")).toBe(
      "Tue, Dec 1, 2026 · 10:00 AM UTC",
    );
  });
});
