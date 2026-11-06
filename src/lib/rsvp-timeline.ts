export type DayCount = { day: string; count: number };
export type TimelinePoint = { day: string; added: number; total: number };

const DAY_MS = 86_400_000;

export function buildTimeline(
  rows: DayCount[],
  from: string,
  to: string,
): TimelinePoint[] {
  const counts = new Map(rows.map((r) => [r.day, r.count]));
  const points: TimelinePoint[] = [];
  let total = 0;

  const end = Date.parse(`${to}T00:00:00Z`);
  for (
    let time = Date.parse(`${from}T00:00:00Z`);
    time <= end;
    time += DAY_MS
  ) {
    const day = new Date(time).toISOString().slice(0, 10);
    const added = counts.get(day) ?? 0;
    total += added;
    points.push({ day, added, total });
  }

  return points;
}
