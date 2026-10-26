import { describe, expect, it } from "vitest";
import { parseOptionalHttpUrl } from "@/lib/url";

describe("parseOptionalHttpUrl", () => {
  it("treats blank input as no value", () => {
    expect(parseOptionalHttpUrl("")).toEqual({ ok: true, url: null });
    expect(parseOptionalHttpUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("accepts http and https urls and trims them", () => {
    expect(parseOptionalHttpUrl("  https://example.com/rsvp ")).toEqual({
      ok: true,
      url: "https://example.com/rsvp",
    });
    expect(parseOptionalHttpUrl("http://example.com")).toEqual({
      ok: true,
      url: "http://example.com/",
    });
  });

  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["ftp://example.com"],
    ["file:///etc/passwd"],
    ["example.com"],
    ["//example.com"],
    ["not a url"],
  ])("rejects %j", (value) => {
    expect(parseOptionalHttpUrl(value)).toEqual({ ok: false });
  });

  it("rejects absurdly long urls", () => {
    expect(parseOptionalHttpUrl("https://example.com/" + "a".repeat(3000))).toEqual({ ok: false });
  });
});
