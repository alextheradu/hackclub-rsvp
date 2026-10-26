import { describe, expect, it } from "vitest";
import { decideStatus, promotionCount } from "@/lib/waitlist";

describe("decideStatus", () => {
  it("unlimited capacity always confirms", () => {
    expect(decideStatus({ capacity: null, confirmedCount: 0 })).toBe("confirmed");
    expect(decideStatus({ capacity: null, confirmedCount: 100000 })).toBe("confirmed");
  });

  it("confirms while there is a free seat", () => {
    expect(decideStatus({ capacity: 2, confirmedCount: 0 })).toBe("confirmed");
    expect(decideStatus({ capacity: 2, confirmedCount: 1 })).toBe("confirmed");
  });

  it("waitlists once the event is full", () => {
    expect(decideStatus({ capacity: 2, confirmedCount: 2 })).toBe("waitlisted");
  });

  it("waitlists when the event is over capacity (capacity was lowered later)", () => {
    expect(decideStatus({ capacity: 2, confirmedCount: 5 })).toBe("waitlisted");
  });

  it("a capacity of 1 fits exactly one person", () => {
    expect(decideStatus({ capacity: 1, confirmedCount: 0 })).toBe("confirmed");
    expect(decideStatus({ capacity: 1, confirmedCount: 1 })).toBe("waitlisted");
  });
});

describe("promotionCount", () => {
  it("promotes only as many people as there are free seats", () => {
    expect(promotionCount({ capacity: 5, confirmedCount: 3, waitlistedCount: 10 })).toBe(2);
  });

  it("promotes everyone waiting when there are more seats than people", () => {
    expect(promotionCount({ capacity: 10, confirmedCount: 3, waitlistedCount: 2 })).toBe(2);
  });

  it("is 0 when nobody waits", () => {
    expect(promotionCount({ capacity: 5, confirmedCount: 3, waitlistedCount: 0 })).toBe(0);
  });

  it("is 0 when the event is full", () => {
    expect(promotionCount({ capacity: 5, confirmedCount: 5, waitlistedCount: 4 })).toBe(0);
  });

  it("is never negative when the event is over capacity", () => {
    expect(promotionCount({ capacity: 2, confirmedCount: 6, waitlistedCount: 4 })).toBe(0);
  });

  it("promotes everyone waiting when capacity is unlimited", () => {
    expect(promotionCount({ capacity: null, confirmedCount: 50, waitlistedCount: 7 })).toBe(7);
  });
});
