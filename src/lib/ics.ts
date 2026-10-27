export function formatIcsUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

// RFC 5545: lines are at most 75 octets; continuation lines start with one space.
export function foldIcsLine(line: string): string {
  const lines: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = lines.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (currentBytes + size > limit) {
      lines.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  lines.push(current);
  return lines.join("\r\n ");
}

export type IcsEvent = {
  id: number;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  locationDisplay: string | null;
  onlineUrl: string | null;
  cancelled: boolean;
};

const HOUR_MS = 60 * 60 * 1000;

export function buildEventIcs(
  event: IcsEvent,
  options: { url: string; host: string; now: Date },
): string {
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + HOUR_MS);
  const description = [event.description, options.url].filter(Boolean).join("\n\n");
  const location = event.locationDisplay ?? event.onlineUrl;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${options.host}//RSVP//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@${options.host}`,
    `DTSTAMP:${formatIcsUtc(options.now)}`,
    `DTSTART:${formatIcsUtc(event.startsAt)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    `URL:${options.url}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
