import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { rosterCsv } from "@/lib/roster-csv";
import type { RosterEntry } from "@/lib/roster";

describe("toCsv", () => {
  it("returns only the header when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });

  it("ends every line with CRLF", () => {
    expect(toCsv(["a"], [["1"], ["2"]])).toBe("a\r\n1\r\n2\r\n");
  });

  it("keeps a newline inside a quoted cell", () => {
    expect(toCsv(["a"], [["x\ny"]])).toBe('a\r\n"x\ny"\r\n');
  });
});

const entry = (overrides: Partial<RosterEntry> = {}): RosterEntry => ({
  rsvpId: 1,
  name: "Ada",
  email: "ada@example.com",
  slackId: "U123",
  status: "confirmed",
  rsvpedAt: new Date("2026-10-31T12:00:00.000Z"),
  ...overrides,
});

describe("rosterCsv", () => {
  it("writes the header for an empty roster", () => {
    expect(rosterCsv([])).toBe("name,email,slack_id,status,rsvped_at\r\n");
  });

  it("writes one row per entry with an ISO timestamp", () => {
    expect(rosterCsv([entry()])).toBe(
      "name,email,slack_id,status,rsvped_at\r\nAda,ada@example.com,U123,confirmed,2026-10-31T12:00:00.000Z\r\n",
    );
  });

  it("writes missing name and slack id as empty cells", () => {
    expect(rosterCsv([entry({ name: null, slackId: null })]).split("\r\n")[1]).toBe(
      ",ada@example.com,,confirmed,2026-10-31T12:00:00.000Z",
    );
  });

  it("neutralises a formula in an attendee's name", () => {
    const row = rosterCsv([entry({ name: '=HYPERLINK("http://x","y")' })]).split("\r\n")[1];
    expect(row.startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});
