import { describe, expect, it } from "vitest";
import { likePattern, parseRosterFilter } from "@/lib/roster-filter";

describe("parseRosterFilter", () => {
  it("returns an empty filter for no params", () => {
    expect(parseRosterFilter({})).toEqual({});
  });

  it.each(["confirmed", "waitlisted", "cancelled"])("accepts status %j", (status) => {
    expect(parseRosterFilter({ status })).toEqual({ status });
  });

  it("drops an unknown status", () => {
    expect(parseRosterFilter({ status: "checked_in" })).toEqual({});
  });

  it("trims the search text", () => {
    expect(parseRosterFilter({ q: "  ada  " })).toEqual({ q: "ada" });
  });

  it("drops blank search text", () => {
    expect(parseRosterFilter({ q: "   " })).toEqual({});
  });

  it("caps search text at 100 characters", () => {
    expect(parseRosterFilter({ q: "a".repeat(150) }).q).toHaveLength(100);
  });

  it("uses the first value when a param is repeated", () => {
    expect(parseRosterFilter({ status: ["waitlisted", "confirmed"], q: ["ada", "bob"] })).toEqual({
      status: "waitlisted",
      q: "ada",
    });
  });
});

describe("likePattern", () => {
  it("wraps the text in wildcards", () => {
    expect(likePattern("ada")).toBe("%ada%");
  });

  it("escapes % and _ so they match literally", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("escapes backslashes", () => {
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});
