import { describe, expect, it } from "vitest";
import { buildUnfurl, parseEventLink, type UnfurlEvent } from "@/lib/unfurl";

const ROOT = "hackclub.rsvp";

describe("parseEventLink", () => {
  it.each([
    ["https://my-ysws.hackclub.rsvp", "my-ysws"],
    ["https://my-ysws.hackclub.rsvp/", "my-ysws"],
    ["https://events.hackclub.rsvp/my-event", "my-event"],
    ["https://hackclub.rsvp/my-event", "my-event"],
    ["https://hackclub.rsvp/my-event/", "my-event"],
    ["http://hackclub.rsvp/my-event", "my-event"],
    ["https://HACKCLUB.RSVP/my-event", "my-event"],
    ["https://hackclub.rsvp/my-event?utm=slack#top", "my-event"],
  ])("accepts %s", (link, slug) => {
    expect(parseEventLink(link, ROOT)).toBe(slug);
  });

  it.each([
    "https://evil.com/my-event",
    "https://hackclub.rsvp.evil.com/my-event",
    "https://www.hackclub.rsvp",
    "https://rsvp.theirclub.org",
    "https://rsvp.theirclub.org/my-event",
    "https://hackclub.rsvp",
    "https://hackclub.rsvp/dashboard",
    "https://hackclub.rsvp/my-event/roster",
    "https://my-ysws.hackclub.rsvp/anything",
    "https://a.b.hackclub.rsvp",
    "https://hackclub.rsvp:8443/my-event",
    "https://user:pass@hackclub.rsvp/my-event",
    "ftp://hackclub.rsvp/my-event",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (link) => {
    expect(parseEventLink(link, ROOT)).toBeNull();
  });
});

function event(overrides: Partial<UnfurlEvent> = {}): UnfurlEvent {
  return {
    id: 42,
    title: "Hack Night",
    orgName: "Hack Club",
    startsAt: new Date("2026-12-05T23:00:00Z"),
    endsAt: null,
    timezone: "UTC",
    locationDisplay: "HQ, Shelburne VT",
    capacity: null,
    confirmed: 0,
    cancelled: false,
    ended: false,
    ...overrides,
  };
}

const URL_ = "https://hackclub.rsvp/hack-night";

function texts(payload: ReturnType<typeof buildUnfurl>): string {
  return JSON.stringify(payload);
}

function actions(payload: ReturnType<typeof buildUnfurl>) {
  const block = payload.blocks.find((b) => b.type === "actions") as
    | { elements: { action_id?: string; value?: string; url?: string }[] }
    | undefined;
  return block?.elements ?? [];
}

describe("buildUnfurl", () => {
  it("links the title and shows when and where", () => {
    const out = texts(buildUnfurl(event(), URL_));
    expect(out).toContain(`<${URL_}|Hack Night>`);
    expect(out).toContain("HQ, Shelburne VT");
    expect(out).toContain("Dec");
  });

  it("shows spots left when the event has a capacity", () => {
    expect(
      texts(buildUnfurl(event({ capacity: 30, confirmed: 18 }), URL_)),
    ).toContain("12 spots left");
  });

  it("says 1 spot, not 1 spots", () => {
    expect(
      texts(buildUnfurl(event({ capacity: 30, confirmed: 29 }), URL_)),
    ).toContain("1 spot left");
  });

  it("shows no spot count for an unlimited event", () => {
    expect(texts(buildUnfurl(event(), URL_))).not.toMatch(/spots? left/);
  });

  it("offers the waitlist once the event is full", () => {
    const payload = buildUnfurl(event({ capacity: 10, confirmed: 10 }), URL_);
    expect(texts(payload)).toContain("waitlist");
    expect(texts(payload)).not.toMatch(/spots? left/);
    expect(actions(payload)[0]).toMatchObject({ action_id: "rsvp" });
  });

  it("has an RSVP button carrying the event id and a link button", () => {
    const [rsvp, view] = actions(buildUnfurl(event(), URL_));
    expect(rsvp).toMatchObject({ action_id: "rsvp", value: "42" });
    expect(view).toMatchObject({ url: URL_ });
  });

  it("drops the RSVP button for a cancelled event", () => {
    const payload = buildUnfurl(event({ cancelled: true }), URL_);
    expect(texts(payload)).toContain("cancelled");
    expect(actions(payload).some((a) => a.action_id === "rsvp")).toBe(false);
  });

  it("drops the RSVP button once the event has ended", () => {
    const payload = buildUnfurl(event({ ended: true }), URL_);
    expect(actions(payload).some((a) => a.action_id === "rsvp")).toBe(false);
  });

  it("escapes &, < and > so a title can't ping or inject links", () => {
    const out = texts(
      buildUnfurl(event({ title: "<!channel> & <https://x.y|z>" }), URL_),
    );
    expect(out).toContain("&lt;!channel&gt; &amp; &lt;https://x.y|z&gt;");
    expect(out).not.toContain("<!channel>");
  });
});
