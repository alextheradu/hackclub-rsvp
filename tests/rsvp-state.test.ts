import { describe, expect, it } from "vitest";
import { rsvpButtonState, type RsvpButtonInput } from "@/lib/rsvp-state";

const NOW = new Date("2026-12-01T12:00:00Z");

function input(overrides: Partial<RsvpButtonInput> = {}): RsvpButtonInput {
  return {
    cancelled: false,
    startsAt: new Date("2026-12-10T18:00:00Z"),
    endsAt: new Date("2026-12-10T20:00:00Z"),
    capacity: 10,
    confirmedCount: 3,
    myStatus: null,
    signedIn: true,
    now: NOW,
    ...overrides,
  };
}

describe("rsvpButtonState", () => {
  it("is open when there are seats and the user can RSVP", () => {
    expect(rsvpButtonState(input())).toBe("open");
  });

  it("is open when there is no capacity limit", () => {
    expect(rsvpButtonState(input({ capacity: null, confirmedCount: 500 }))).toBe("open");
  });

  it("asks signed-out visitors to sign in", () => {
    expect(rsvpButtonState(input({ signedIn: false }))).toBe("signed_out");
  });

  it("is full when every seat is taken, so the button offers the waitlist", () => {
    expect(rsvpButtonState(input({ capacity: 10, confirmedCount: 10 }))).toBe("full");
    expect(rsvpButtonState(input({ capacity: 10, confirmedCount: 12 }))).toBe("full");
  });

  it("shows signed-out before full", () => {
    expect(rsvpButtonState(input({ signedIn: false, capacity: 1, confirmedCount: 1 }))).toBe("signed_out");
  });

  it("shows the user's own status over open or full", () => {
    expect(rsvpButtonState(input({ myStatus: "confirmed" }))).toBe("confirmed");
    expect(rsvpButtonState(input({ myStatus: "waitlisted", capacity: 1, confirmedCount: 1 }))).toBe("waitlisted");
  });

  it("is cancelled for a cancelled event, even if the user had an RSVP", () => {
    expect(rsvpButtonState(input({ cancelled: true }))).toBe("cancelled");
    expect(rsvpButtonState(input({ cancelled: true, myStatus: "confirmed" }))).toBe("cancelled");
  });

  it("is closed once the event has ended", () => {
    expect(rsvpButtonState(input({ now: new Date("2026-12-10T20:00:01Z") }))).toBe("closed");
  });

  it("is closed after the start when there is no end time", () => {
    const base = { endsAt: null, startsAt: new Date("2026-12-10T18:00:00Z") };
    expect(rsvpButtonState(input({ ...base, now: new Date("2026-12-10T17:59:59Z") }))).toBe("open");
    expect(rsvpButtonState(input({ ...base, now: new Date("2026-12-10T18:00:01Z") }))).toBe("closed");
  });

  it("is still open while a timed event is running", () => {
    expect(rsvpButtonState(input({ now: new Date("2026-12-10T19:00:00Z") }))).toBe("open");
  });

  it("keeps showing the user's status after the event has ended", () => {
    const after = new Date("2026-12-11T00:00:00Z");
    expect(rsvpButtonState(input({ now: after, myStatus: "confirmed" }))).toBe("confirmed");
  });

  it("is closed for signed-out visitors after the event has ended", () => {
    expect(rsvpButtonState(input({ now: new Date("2026-12-11T00:00:00Z"), signedIn: false }))).toBe("closed");
  });
});
