function parts(date: Date, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    });
  }
  const map = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    day: `${map.weekday}, ${map.month} ${map.day}, ${map.year}`,
    time: `${map.hour}:${map.minute} ${map.dayPeriod}`,
    zone: map.timeZoneName,
  };
}

export function formatEventWhen(
  start: Date,
  end: Date | null,
  timeZone: string,
): string {
  const from = parts(start, timeZone);
  if (!end) return `${from.day} · ${from.time} ${from.zone}`;
  const to = parts(end, timeZone);
  if (from.day === to.day)
    return `${from.day} · ${from.time} – ${to.time} ${to.zone}`;
  return `${from.day} · ${from.time} ${from.zone} to ${to.day} · ${to.time} ${to.zone}`;
}

export function dateTile(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  const [weekday, monthDay, year] = p.day.split(", ");
  const [month, day] = monthDay.split(" ");
  return { weekday, month, day, year, time: p.time, zone: p.zone };
}

export function timeAgo(date: Date, now: Date, timeZone = "UTC"): string {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  const { month, day } = dateTile(date, timeZone);
  return `${month} ${day}`;
}
