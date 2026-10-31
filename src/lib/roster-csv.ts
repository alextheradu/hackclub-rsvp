import { toCsv } from "@/lib/csv";
import type { RosterEntry } from "@/lib/roster";

const HEADER = ["name", "email", "slack_id", "status", "rsvped_at"];

export function rosterCsv(entries: RosterEntry[]): string {
  return toCsv(
    HEADER,
    entries.map((e) => [e.name, e.email, e.slackId, e.status, e.rsvpedAt.toISOString()]),
  );
}
