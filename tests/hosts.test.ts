import { describe, expect, it } from "vitest";
import { rewriteTarget } from "@/lib/hosts";

describe("rewriteTarget: slug.hackclub.rsvp", () => {
  it("serves the event page at the root of the subdomain", () => {
    expect(rewriteTarget("my-ysws.hackclub.rsvp", "/")).toBe("/e/my-ysws");
  });

  it("keeps the rest of the path", () => {
    expect(rewriteTarget("my-ysws.hackclub.rsvp", "/rsvp")).toBe("/e/my-ysws/rsvp");
    expect(rewriteTarget("my-ysws.hackclub.rsvp", "/calendar.ics")).toBe(
      "/e/my-ysws/calendar.ics",
    );
  });

  it("ignores case and a port", () => {
    expect(rewriteTarget("My-YSWS.HackClub.rsvp:443", "/")).toBe("/e/my-ysws");
  });

  it.each(["www", "origin", "domains", "events", "dev", "api", "admin"])(
    "leaves the reserved subdomain %s alone",
    (name) => {
      expect(rewriteTarget(`${name}.hackclub.rsvp`, "/")).toBeNull();
    },
  );

  it("leaves a subdomain that is not a valid slug alone", () => {
    expect(rewriteTarget("ab.hackclub.rsvp", "/")).toBeNull();
    expect(rewriteTarget("a_b_c.hackclub.rsvp", "/")).toBeNull();
  });

  it("leaves deeper subdomains alone", () => {
    expect(rewriteTarget("x.my-ysws.hackclub.rsvp", "/")).toBeNull();
  });
});

describe("rewriteTarget: events.hackclub.rsvp", () => {
  it("maps /<slug> to the event page", () => {
    expect(rewriteTarget("events.hackclub.rsvp", "/my-meetup")).toBe("/e/my-meetup");
  });

  it("keeps the rest of the path", () => {
    expect(rewriteTarget("events.hackclub.rsvp", "/my-meetup/rsvp")).toBe(
      "/e/my-meetup/rsvp",
    );
  });

  it("has nothing at the root or for an invalid or reserved first segment", () => {
    expect(rewriteTarget("events.hackclub.rsvp", "/")).toBeNull();
    expect(rewriteTarget("events.hackclub.rsvp", "/Bad_Name")).toBeNull();
    expect(rewriteTarget("events.hackclub.rsvp", "/login")).toBeNull();
  });
});

describe("rewriteTarget: hackclub.rsvp (apex, used for Slack unfurls)", () => {
  it("serves /<slug> as the event page", () => {
    expect(rewriteTarget("hackclub.rsvp", "/my-ysws")).toBe("/e/my-ysws");
  });

  it("never touches the app's own routes", () => {
    for (const path of ["/", "/login", "/logout", "/dashboard", "/dashboard/events/new", "/oauth/callback", "/e/my-ysws", "/api/slack/events"]) {
      expect(rewriteTarget("hackclub.rsvp", path)).toBeNull();
    }
  });

  it("never touches static files", () => {
    expect(rewriteTarget("hackclub.rsvp", "/hackclub-flag.svg")).toBeNull();
    expect(rewriteTarget("hackclub.rsvp", "/icon-rounded.svg")).toBeNull();
  });
});

describe("rewriteTarget: other hosts", () => {
  it.each([
    ["localhost:3001"],
    ["xl6qqg42-3001.use.devtunnels.ms"],
    ["rsvp.alexradu.co"],
    ["origin.hackclub.rsvp"],
    ["domains.hackclub.rsvp"],
    ["nothackclub.rsvp"],
    ["hackclub.rsvp.evil.com"],
  ])("leaves %s alone", (host) => {
    expect(rewriteTarget(host, "/anything")).toBeNull();
  });
});
