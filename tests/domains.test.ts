import { describe, expect, it } from "vitest";
import { validateCustomHost } from "@/lib/domains";

const ROOT = "hackclub.rsvp";

function check(raw: string) {
  return validateCustomHost(raw, ROOT);
}

describe("validateCustomHost", () => {
  it.each([
    ["rsvp.theirclub.org", "rsvp.theirclub.org"],
    ["rsvp.theirclub.co.uk", "rsvp.theirclub.co.uk"],
    ["events.rsvp.theirclub.org", "events.rsvp.theirclub.org"],
    ["www.theirclub.org", "www.theirclub.org"],
    ["RSVP.TheirClub.ORG", "rsvp.theirclub.org"],
    ["  rsvp.theirclub.org  ", "rsvp.theirclub.org"],
    ["rsvp.theirclub.org.", "rsvp.theirclub.org"],
    ["rsvp.bücher.de", "rsvp.xn--bcher-kva.de"],
    ["my-club.theirclub.org", "my-club.theirclub.org"],
  ])("accepts %j as %j", (raw, host) => {
    expect(check(raw)).toEqual({ ok: true, host });
  });

  it.each(["theirclub.org", "theirclub.co.uk", "THEIRCLUB.ORG."])(
    "rejects the apex domain %j",
    (raw) => {
      expect(check(raw)).toEqual({ ok: false, reason: "apex" });
    },
  );

  it.each(["1.2.3.4", "[::1]", "::1", "2001:db8::1", "192.168.0.1"])(
    "rejects the IP address %j",
    (raw) => {
      expect(check(raw)).toEqual({ ok: false, reason: "ip" });
    },
  );

  it.each([
    "hackclub.rsvp",
    "foo.hackclub.rsvp",
    "events.hackclub.rsvp",
    "domains.hackclub.rsvp",
    "a.b.hackclub.rsvp",
    "FOO.HACKCLUB.RSVP.",
  ])("rejects our own domain %j", (raw) => {
    expect(check(raw)).toEqual({ ok: false, reason: "reserved" });
  });

  it.each([
    "",
    "   ",
    "https://rsvp.theirclub.org",
    "rsvp.theirclub.org/path",
    "rsvp.theirclub.org:8443",
    "user@rsvp.theirclub.org",
    "rsvp theirclub.org",
    "rsvp..theirclub.org",
    "-rsvp.theirclub.org",
    "rsvp-.theirclub.org",
    "rsvp_x.theirclub.org",
    "*.theirclub.org",
    "localhost",
    "rsvp.localhost",
    "rsvp.theirclub.local",
    "rsvp.theirclub.example",
    "rsvp.theirclub.notarealtld",
    `${"a".repeat(64)}.theirclub.org`,
    `${"a.".repeat(130)}theirclub.org`,
  ])("rejects the malformed host %j", (raw) => {
    expect(check(raw)).toEqual({ ok: false, reason: "format" });
  });

  it("is not fooled by a lookalike of our domain", () => {
    expect(check("rsvp.hackclub.rsvp.evil.com")).toEqual({
      ok: true,
      host: "rsvp.hackclub.rsvp.evil.com",
    });
    expect(check("nothackclub.rsvp")).toEqual({ ok: false, reason: "apex" });
  });
});
