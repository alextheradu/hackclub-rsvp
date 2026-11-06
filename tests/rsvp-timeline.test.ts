import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/rsvp-timeline";

describe("buildTimeline", () => {
  it("fills days with no RSVPs and keeps a running total", () => {
    const rows = [
      { day: "2026-11-01", count: 3 },
      { day: "2026-11-03", count: 2 },
    ];
    expect(buildTimeline(rows, "2026-11-01", "2026-11-04")).toEqual([
      { day: "2026-11-01", added: 3, total: 3 },
      { day: "2026-11-02", added: 0, total: 3 },
      { day: "2026-11-03", added: 2, total: 5 },
      { day: "2026-11-04", added: 0, total: 5 },
    ]);
  });

  it("returns one point when from and to are the same day", () => {
    expect(
      buildTimeline(
        [{ day: "2026-11-05", count: 7 }],
        "2026-11-05",
        "2026-11-05",
      ),
    ).toEqual([{ day: "2026-11-05", added: 7, total: 7 }]);
  });

  it("returns zeros when there are no RSVPs", () => {
    expect(buildTimeline([], "2026-11-01", "2026-11-02")).toEqual([
      { day: "2026-11-01", added: 0, total: 0 },
      { day: "2026-11-02", added: 0, total: 0 },
    ]);
  });

  it("returns nothing when from is after to", () => {
    expect(buildTimeline([], "2026-11-03", "2026-11-01")).toEqual([]);
  });

  it("ignores rows outside the range", () => {
    const rows = [
      { day: "2026-10-31", count: 4 },
      { day: "2026-11-01", count: 1 },
    ];
    expect(buildTimeline(rows, "2026-11-01", "2026-11-01")).toEqual([
      { day: "2026-11-01", added: 1, total: 1 },
    ]);
  });

  it("crosses a month end and the US daylight saving change", () => {
    const days = buildTimeline([], "2026-10-30", "2026-11-03").map(
      (point) => point.day,
    );
    expect(days).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
  });
});
