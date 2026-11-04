import { describe, expect, it } from "vitest";
import { capacityTone, groupEvents, isLive, parseEventTab } from "@/lib/event-list";

const NOW = new Date("2026-11-03T12:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

function ev(name: string, startsAt: Date, endsAt: Date | null = null, cancelled = false) {
  return { name, startsAt, endsAt, cancelled };
}

describe("parseEventTab", () => {
  it("defaults to upcoming for anything unknown", () => {
    expect(parseEventTab(undefined)).toBe("upcoming");
    expect(parseEventTab("nope")).toBe("upcoming");
    expect(parseEventTab(["past"])).toBe("upcoming");
    expect(parseEventTab("past")).toBe("past");
    expect(parseEventTab("cancelled")).toBe("cancelled");
  });
});

describe("groupEvents", () => {
  it("splits upcoming, past and cancelled", () => {
    const groups = groupEvents(
      [
        ev("future", hours(48)),
        ev("old", hours(-72), hours(-70)),
        ev("gone", hours(24), null, true),
        ev("happening", hours(-1), hours(3)),
      ],
      NOW,
    );
    expect(groups.upcoming.map((e) => e.name)).toEqual(["happening", "future"]);
    expect(groups.past.map((e) => e.name)).toEqual(["old"]);
    expect(groups.cancelled.map((e) => e.name)).toEqual(["gone"]);
  });

  it("keeps an event with no end time upcoming for 12 hours after it starts", () => {
    const groups = groupEvents([ev("recent", hours(-11)), ev("stale", hours(-13))], NOW);
    expect(groups.upcoming.map((e) => e.name)).toEqual(["recent"]);
    expect(groups.past.map((e) => e.name)).toEqual(["stale"]);
  });

  it("orders past and cancelled most recent first", () => {
    const groups = groupEvents(
      [
        ev("p1", hours(-200), hours(-199)),
        ev("p2", hours(-50), hours(-49)),
        ev("c1", hours(-10), null, true),
        ev("c2", hours(100), null, true),
      ],
      NOW,
    );
    expect(groups.past.map((e) => e.name)).toEqual(["p2", "p1"]);
    expect(groups.cancelled.map((e) => e.name)).toEqual(["c2", "c1"]);
  });

  it("treats an event ending exactly now as past", () => {
    const groups = groupEvents([ev("edge", hours(-2), NOW)], NOW);
    expect(groups.past).toHaveLength(1);
  });
});

describe("isLive", () => {
  it("is true only between start and end of a non-cancelled event", () => {
    expect(isLive(ev("a", hours(-1), hours(1)), NOW)).toBe(true);
    expect(isLive(ev("b", hours(1), hours(2)), NOW)).toBe(false);
    expect(isLive(ev("c", hours(-3), hours(-1)), NOW)).toBe(false);
    expect(isLive(ev("d", hours(-1), hours(1), true), NOW)).toBe(false);
  });
});

describe("capacityTone", () => {
  it("is open with no limit or under 80%", () => {
    expect(capacityTone(500, null)).toBe("open");
    expect(capacityTone(7, 10)).toBe("open");
  });

  it("is filling from 80% and full at capacity", () => {
    expect(capacityTone(8, 10)).toBe("filling");
    expect(capacityTone(10, 10)).toBe("full");
  });
});
