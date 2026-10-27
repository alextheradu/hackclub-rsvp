import { describe, expect, it } from "vitest";
import { toCsvRow } from "@/lib/csv";

describe("toCsvRow: plain values", () => {
  it("joins values with commas and no trailing newline", () => {
    expect(toCsvRow(["Ada", "ada@example.com"])).toBe("Ada,ada@example.com");
  });

  it("writes null and undefined as empty cells", () => {
    expect(toCsvRow(["a", null, undefined, "d"])).toBe("a,,,d");
  });

  it("writes numbers and booleans as text", () => {
    expect(toCsvRow([3, 0, -2, true, false])).toBe("3,0,-2,true,false");
  });

  it("handles an empty row", () => {
    expect(toCsvRow([])).toBe("");
  });
});

describe("toCsvRow: quoting", () => {
  it("quotes values with a comma", () => {
    expect(toCsvRow(["Lovelace, Ada"])).toBe('"Lovelace, Ada"');
  });

  it("quotes values with a newline", () => {
    expect(toCsvRow(["line one\nline two"])).toBe('"line one\nline two"');
    expect(toCsvRow(["line one\r\nline two"])).toBe('"line one\r\nline two"');
  });

  it("quotes values with a quote and doubles the inner quotes", () => {
    expect(toCsvRow(['say "hi"'])).toBe('"say ""hi"""');
  });

  it("leaves values without special characters unquoted", () => {
    expect(toCsvRow(["plain text", "o'brien"])).toBe("plain text,o'brien");
  });
});

describe("toCsvRow: formula injection", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "prefixes %j with a single quote so spreadsheets treat it as text",
    (value) => {
      expect(toCsvRow([value]).replace(/^"|"$/g, "")).toMatch(/^'/);
    },
  );

  it("guards before quoting", () => {
    expect(toCsvRow(["=HYPERLINK(\"http://x\",\"y\")"])).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
  });

  it("does not touch a dash or equals sign in the middle", () => {
    expect(toCsvRow(["a-b", "x=y", "a+b", "me@host"])).toBe("a-b,x=y,a+b,me@host");
  });

  it("does not guard real numbers", () => {
    expect(toCsvRow([-5, 0])).toBe("-5,0");
  });
});
