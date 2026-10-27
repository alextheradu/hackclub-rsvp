import { describe, expect, it } from "vitest";
import { buildEventIcs, escapeIcsText, foldIcsLine, formatIcsUtc } from "@/lib/ics";

describe("formatIcsUtc", () => {
  it("formats as YYYYMMDDTHHMMSSZ in UTC", () => {
    expect(formatIcsUtc(new Date("2026-11-08T17:00:00Z"))).toBe("20261108T170000Z");
  });

  it("zero-pads month, day, hour, minute and second", () => {
    expect(formatIcsUtc(new Date("2026-01-02T03:04:05Z"))).toBe("20260102T030405Z");
  });

  it("converts offsets to UTC", () => {
    expect(formatIcsUtc(new Date("2026-11-08T12:00:00-05:00"))).toBe("20261108T170000Z");
  });

  it("drops milliseconds", () => {
    expect(formatIcsUtc(new Date("2026-11-08T17:00:00.789Z"))).toBe("20261108T170000Z");
  });

  it("rolls over midnight correctly", () => {
    expect(formatIcsUtc(new Date("2026-12-31T23:59:59Z"))).toBe("20261231T235959Z");
  });
});

describe("escapeIcsText", () => {
  it("leaves plain text alone", () => {
    expect(escapeIcsText("Hack Night")).toBe("Hack Night");
  });

  it("escapes commas and semicolons", () => {
    expect(escapeIcsText("a, b; c")).toBe("a\\, b\\; c");
  });

  it("escapes backslashes", () => {
    expect(escapeIcsText("C:\\temp")).toBe("C:\\\\temp");
  });

  it("escapes backslashes before the other characters", () => {
    expect(escapeIcsText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("turns newlines into a literal \\n", () => {
    expect(escapeIcsText("one\ntwo")).toBe("one\\ntwo");
    expect(escapeIcsText("one\r\ntwo")).toBe("one\\ntwo");
  });

  it("keeps unicode as is", () => {
    expect(escapeIcsText("Café, 🚀")).toBe("Café\\, 🚀");
  });
});

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:Hack Night")).toBe("SUMMARY:Hack Night");
  });

  it("keeps a line of exactly 75 octets unfolded", () => {
    const line = "X".repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds longer lines with CRLF and a leading space", () => {
    const folded = foldIcsLine("X".repeat(76));
    expect(folded).toBe(`${"X".repeat(75)}\r\n X`);
  });

  it("never exceeds 75 octets per physical line", () => {
    const folded = foldIcsLine("A".repeat(400));
    for (const line of folded.split("\r\n")) {
      expect(bytes(line)).toBeLessThanOrEqual(75);
    }
  });

  it("unfolds back to the original", () => {
    const original = "DESCRIPTION:" + "word ".repeat(80);
    expect(foldIcsLine(original).replace(/\r\n /g, "")).toBe(original);
  });

  it("counts UTF-8 octets, not characters, and never splits a character", () => {
    const original = "SUMMARY:" + "é🚀".repeat(60);
    const folded = foldIcsLine(original);
    for (const line of folded.split("\r\n")) {
      expect(bytes(line)).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(original);
  });
});

describe("buildEventIcs", () => {
  const event = {
    id: 42,
    title: "Hack Night, Vol. 2",
    description: "Bring a laptop;\nsnacks provided.",
    startsAt: new Date("2026-11-08T17:00:00Z"),
    endsAt: new Date("2026-11-08T20:00:00Z") as Date | null,
    locationDisplay: "Room 12, Main St" as string | null,
    onlineUrl: null as string | null,
    cancelled: false,
  };
  const url = "https://hackclub.rsvp/hack-night";
  const now = new Date("2026-10-26T12:00:00Z");
  const build = (overrides = {}) =>
    buildEventIcs({ ...event, ...overrides }, { url, host: "hackclub.rsvp", now });

  it("is a calendar with CRLF line endings and a trailing CRLF", () => {
    const ics = build();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("declares version and prodid", () => {
    const ics = build();
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:-//hackclub.rsvp//RSVP//EN\r\n");
  });

  it("has a stable uid, a dtstamp and UTC start and end", () => {
    const ics = build();
    expect(ics).toContain("UID:event-42@hackclub.rsvp\r\n");
    expect(ics).toContain("DTSTAMP:20261026T120000Z\r\n");
    expect(ics).toContain("DTSTART:20261108T170000Z\r\n");
    expect(ics).toContain("DTEND:20261108T200000Z\r\n");
  });

  it("defaults the end to one hour after the start", () => {
    expect(build({ endsAt: null })).toContain("DTEND:20261108T180000Z\r\n");
  });

  it("escapes text properties", () => {
    const ics = build();
    expect(ics).toContain("SUMMARY:Hack Night\\, Vol. 2\r\n");
    expect(ics).toContain("LOCATION:Room 12\\, Main St\r\n");
  });

  it("puts the event link in the description and in URL", () => {
    const ics = build().replace(/\r\n /g, "");
    expect(ics).toContain("URL:https://hackclub.rsvp/hack-night\r\n");
    expect(ics).toContain("snacks provided.\\n\\nhttps://hackclub.rsvp/hack-night\r\n");
  });

  it("uses the online link as the location when there is no place", () => {
    const ics = build({ locationDisplay: null, onlineUrl: "https://meet.example.com/x" });
    expect(ics).toContain("LOCATION:https://meet.example.com/x\r\n");
  });

  it("omits the location when there is none", () => {
    expect(build({ locationDisplay: null })).not.toContain("LOCATION:");
  });

  it("marks cancelled events", () => {
    expect(build({ cancelled: true })).toContain("STATUS:CANCELLED\r\n");
    expect(build()).toContain("STATUS:CONFIRMED\r\n");
  });

  it("cannot be broken out of by a title with a newline", () => {
    const ics = build({ title: "Evil\r\nEND:VEVENT\r\nBEGIN:VEVENT" });
    expect(ics.match(/^BEGIN:VEVENT/gm)).toHaveLength(1);
    expect(ics.match(/^END:VEVENT/gm)).toHaveLength(1);
  });
});
