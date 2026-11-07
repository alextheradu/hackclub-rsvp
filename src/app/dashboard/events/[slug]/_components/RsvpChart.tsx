"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimelinePoint } from "@/lib/rsvp-timeline";
import styles from "./RsvpChart.module.css";

const WIDTH = 600;
const HEIGHT = 140;

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RsvpChart({
  points,
  capacity,
}: {
  points: TimelinePoint[];
  capacity: number | null;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;

  const last = points[points.length - 1];
  const max = Math.max(last.total, capacity ?? 0, 1) * 1.1;
  const x = (i: number) => (i / (points.length - 1)) * WIDTH;
  const y = (total: number) => HEIGHT - (total / max) * HEIGHT;
  const left = (i: number) => `${(x(i) / WIDTH) * 100}%`;
  const top = (total: number) => `${(y(total) / HEIGHT) * 100}%`;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.total)}`)
    .join(" ");
  const area = `${line} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;

  const busiest = points.reduce((best, p) => (p.added > best.added ? p : best));
  const summary =
    `${last.total} going as of ${formatDay(last.day)}, up from ${points[0].total} on ${formatDay(points[0].day)}. ` +
    `Busiest day: ${formatDay(busiest.day)} with ${busiest.added}.`;

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - box.left) / box.width, 0),
      1,
    );
    setActive(Math.round(ratio * (points.length - 1)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    setActive((i) =>
      Math.min(Math.max((i ?? points.length - 1) + step, 0), points.length - 1),
    );
  }

  const shown = active === null ? null : points[active];

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>Over time</figcaption>
      <p className="sr-only">{summary}</p>
      <div
        className={styles.plot}
        tabIndex={0}
        aria-label="RSVPs per day. Use the arrow keys to move between days."
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg
          className={styles.chart}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          <path className={styles.area} d={area} />
          {capacity !== null && (
            <line
              className={styles.capacity}
              x1={0}
              x2={WIDTH}
              y1={y(capacity)}
              y2={y(capacity)}
            />
          )}
          <path className={styles.line} d={line} />
        </svg>

        {capacity !== null && (
          <span
            className={styles.capacityLabel}
            style={{ top: top(capacity) }}
            aria-hidden="true"
          >
            {capacity} capacity
          </span>
        )}
        <span
          className={styles.dot}
          style={{ left: "100%", top: top(last.total) }}
          aria-hidden="true"
        />

        {shown && active !== null && (
          <>
            <span
              className={styles.crosshair}
              style={{ left: left(active) }}
              aria-hidden="true"
            />
            <span
              className={styles.dot}
              style={{ left: left(active), top: top(shown.total) }}
              aria-hidden="true"
            />
            <span
              className={styles.tooltip}
              data-side={active > (points.length - 1) / 2 ? "left" : "right"}
              style={{ left: left(active) }}
              role="status"
            >
              <strong>{shown.total} going</strong>
              <span>
                {formatDay(shown.day)} · +{shown.added} that day
              </span>
            </span>
          </>
        )}
      </div>
      <div className={styles.axis} aria-hidden="true">
        <span>{formatDay(points[0].day)}</span>
        <span>{formatDay(last.day)}</span>
      </div>
    </figure>
  );
}
