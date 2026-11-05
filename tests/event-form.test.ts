import { describe, expect, it } from "vitest";
import type { PublicEvent } from "@/lib/events";
import { eventFormValues, parseEventChanges } from "@/lib/event-form";

const event: PublicEvent = {
  id: 1,
  slug: "counterspell",
  title: "Counterspell",
  kind: "irl",
  description: "Game jam",
  startsAt: new Date("2026-11-21T14:00:00Z"),
  endsAt: new Date("2026-11-22T22:00:00Z"),
  timezone: "America/New_York",
  locationDisplay: "Brooklyn, NY",
  onlineUrl: null,
  website: null,
  capacity: 120,
  cancelled: false,
  orgName: "Hack Club",
};

const valid = {
  title: "Counterspell",
  startsLocal: "2026-11-21T09:00",
  endsLocal: "2026-11-22T17:00",
  timezone: "America/New_York",
  capacity: "120",
  website: "",
  onlineUrl: "",
  locationDisplay: "Brooklyn, NY",
  description: "",
};

function error(values: Record<string, string>) {
  const result = parseEventChanges(values, "irl");
  return result.ok ? null : result.error;
}

function field(values: Record<string, string>) {
  const result = parseEventChanges(values, "irl");
  return result.ok ? null : result.field;
}

describe("eventFormValues", () => {
  it("fills the form from the event in its own timezone", () => {
    expect(eventFormValues(event)).toEqual({
      title: "Counterspell",
      startsLocal: "2026-11-21T09:00",
      endsLocal: "2026-11-22T17:00",
      timezone: "America/New_York",
      capacity: "120",
      website: "",
      onlineUrl: "",
      locationDisplay: "Brooklyn, NY",
      description: "Game jam",
    });
  });

  it("leaves optional fields empty", () => {
    const values = eventFormValues({ ...event, endsAt: null, capacity: null, description: null });
    expect(values.endsLocal).toBe("");
    expect(values.capacity).toBe("");
    expect(values.description).toBe("");
  });

  it("round-trips through parseEventChanges", () => {
    const result = parseEventChanges(eventFormValues(event), event.kind);
    expect(result).toEqual({
      ok: true,
      changes: {
        title: "Counterspell",
        description: "Game jam",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: "America/New_York",
        capacity: 120,
        website: null,
        onlineUrl: null,
        locationDisplay: "Brooklyn, NY",
      },
    });
  });
});

describe("parseEventChanges", () => {
  it("trims and empties optional fields to null", () => {
    const result = parseEventChanges({ ...valid, endsLocal: "", capacity: " ", locationDisplay: "  " }, "irl");
    expect(result.ok && result.changes).toMatchObject({ endsAt: null, capacity: null, locationDisplay: null });
  });

  it("requires a title", () => {
    expect(error({ ...valid, title: "   " })).toBe("Give the event a title.");
  });

  it("requires a valid start", () => {
    expect(error({ ...valid, startsLocal: "" })).toMatch(/start time/);
  });

  it("rejects an end before the start", () => {
    expect(error({ ...valid, endsLocal: "2026-11-21T08:00" })).toBe("The event has to end after it starts.");
  });

  it("rejects a bad capacity", () => {
    for (const capacity of ["0", "-3", "2.5", "abc", "100001"]) {
      expect(error({ ...valid, capacity })).toMatch(/Capacity/);
    }
  });

  it("rejects non-http links", () => {
    expect(error({ ...valid, onlineUrl: "javascript:alert(1)" })).toMatch(/http/);
  });

  it("keeps only the fields that apply to the event's kind", () => {
    const values = { ...valid, website: "https://example.com", onlineUrl: "https://meet.example.com" };
    const irl = parseEventChanges(values, "irl");
    const ysws = parseEventChanges(values, "ysws");
    expect(irl.ok && irl.changes).toMatchObject({ website: null, onlineUrl: "https://meet.example.com/" });
    expect(ysws.ok && ysws.changes).toMatchObject({ website: "https://example.com/", onlineUrl: null, locationDisplay: null });
  });

  it("reads times in the chosen timezone", () => {
    const result = parseEventChanges({ ...valid, timezone: "Europe/London", endsLocal: "" }, "irl");
    expect(result.ok && result.changes.startsAt).toEqual(new Date("2026-11-21T09:00:00Z"));
  });

  it("names the field that failed", () => {
    expect(field({ ...valid, title: "" })).toBe("title");
    expect(field({ ...valid, startsLocal: "nope" })).toBe("startsLocal");
    expect(field({ ...valid, endsLocal: "2026-11-20T09:00" })).toBe("endsLocal");
    expect(field({ ...valid, capacity: "0" })).toBe("capacity");
    expect(field({ ...valid, website: "ftp://x" })).toBe("website");
    expect(field({ ...valid, onlineUrl: "ftp://x" })).toBe("onlineUrl");
  });
});
