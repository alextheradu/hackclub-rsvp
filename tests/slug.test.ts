import { describe, expect, it } from "vitest";
import { eventUrl, unfurlUrl, validateSlug } from "@/lib/slug";

const RESERVED = [
  "www",
  "origin",
  "domains",
  "events",
  "dev",
  "app",
  "api",
  "admin",
  "mail",
  "static",
  "assets",
];

describe("validateSlug", () => {
  it("accepts a normal slug", () => {
    expect(validateSlug("my-event-2026")).toEqual({ ok: true });
  });

  it("accepts the shortest and longest allowed slugs", () => {
    expect(validateSlug("abc")).toEqual({ ok: true });
    expect(validateSlug("a".repeat(40))).toEqual({ ok: true });
  });

  it.each([
    ["too short", "ab"],
    ["empty", ""],
    ["capitals", "Has Caps"],
    ["underscore", "has_underscore"],
    ["41 characters", "a".repeat(41)],
    ["a dot", "my.event"],
    ["a slash", "my/event"],
  ])("rejects %s as a format error", (_label, slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, reason: "format" });
  });

  it.each(RESERVED)("rejects the reserved name %s", (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, reason: "reserved" });
  });

  it("rejects the unicode lookalike for www", () => {
    expect(validateSlug("ｗｗｗ")).toEqual({ ok: false, reason: "format" });
  });
});

describe("eventUrl", () => {
  it("uses the subdomain for ysws events", () => {
    expect(eventUrl({ kind: "ysws", slug: "my-ysws" })).toBe("https://my-ysws.hackclub.rsvp");
  });

  it("uses events.hackclub.rsvp for irl events", () => {
    expect(eventUrl({ kind: "irl", slug: "my-meetup" })).toBe(
      "https://events.hackclub.rsvp/my-meetup",
    );
  });
});

describe("unfurlUrl", () => {
  it("lives on the apex domain", () => {
    expect(unfurlUrl("my-ysws")).toBe("https://hackclub.rsvp/my-ysws");
  });
});
