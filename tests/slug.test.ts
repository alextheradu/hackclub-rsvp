import { describe, expect, it } from "vitest";
import { eventUrl, slugify, unfurlUrl, validateSlug } from "@/lib/slug";

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

describe("slugify", () => {
  it.each([
    ["My Event 2026", "my-event-2026"],
    ["  Hello,   World!  ", "hello-world"],
    ["Café Hack Night", "cafe-hack-night"],
    ["a--b__c", "a-b-c"],
    ["---abc---", "abc"],
    ["Summer of Making: Launch Party (NYC)", "summer-of-making-launch-party-nyc"],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("日本語")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("caps the slug at 40 characters", () => {
    expect(slugify("a".repeat(30) + " " + "b".repeat(30))).toBe("a".repeat(30) + "-" + "b".repeat(9));
  });

  it("never leaves a trailing hyphen after cutting at 40", () => {
    expect(slugify("a".repeat(39) + " bbb")).toBe("a".repeat(39));
  });

  it("produces something validateSlug accepts for a normal title", () => {
    expect(validateSlug(slugify("Boston Hack Night"))).toEqual({ ok: true });
  });
});
