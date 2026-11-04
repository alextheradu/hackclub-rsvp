import type { EventSummary } from "@/lib/events";

export type EventTab = "upcoming" | "past" | "cancelled";

const OPEN_ENDED_MS = 12 * 60 * 60 * 1000;

export function parseEventTab(value: string | string[] | undefined): EventTab {
  return value === "past" || value === "cancelled" ? value : "upcoming";
}

export function eventEndsAt(event: Pick<EventSummary, "startsAt" | "endsAt">): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + OPEN_ENDED_MS);
}

export function isLive(event: Pick<EventSummary, "startsAt" | "endsAt" | "cancelled">, now: Date): boolean {
  return !event.cancelled && event.startsAt <= now && eventEndsAt(event) > now;
}

export function groupEvents<T extends Pick<EventSummary, "startsAt" | "endsAt" | "cancelled">>(
  events: T[],
  now: Date,
): Record<EventTab, T[]> {
  const groups: Record<EventTab, T[]> = { upcoming: [], past: [], cancelled: [] };
  for (const event of events) {
    if (event.cancelled) groups.cancelled.push(event);
    else if (eventEndsAt(event) > now) groups.upcoming.push(event);
    else groups.past.push(event);
  }
  const soonest = (a: T, b: T) => a.startsAt.getTime() - b.startsAt.getTime();
  groups.upcoming.sort(soonest);
  groups.past.sort((a, b) => soonest(b, a));
  groups.cancelled.sort((a, b) => soonest(b, a));
  return groups;
}

export function capacityTone(confirmed: number, capacity: number | null): "open" | "filling" | "full" {
  if (capacity === null) return "open";
  if (confirmed >= capacity) return "full";
  return confirmed / capacity >= 0.8 ? "filling" : "open";
}
