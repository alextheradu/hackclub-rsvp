"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./Segmented.module.css";

export type SegmentedOption = {
  value: string;
  label: string;
  href: string;
  count?: number;
};

type Props = {
  label: string;
  options: SegmentedOption[];
  value: string;
};

export function Segmented({ label, options, value }: Props) {
  const [clicked, setClicked] = useState<{ from: string; to: string } | null>(
    null,
  );
  const active = clicked && clicked.from === value ? clicked.to : value;
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return;

    const place = () => {
      const item = track.querySelector<HTMLElement>(
        `[data-value="${CSS.escape(active)}"]`,
      );
      if (!item) return;
      const top = item.offsetTop;
      const left = item.offsetLeft;
      const right = track.clientWidth - left - item.offsetWidth;
      const bottom = track.clientHeight - top - item.offsetHeight;
      pill.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 999px)`;
      track.dataset.ready = "true";
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(track);
    return () => observer.disconnect();
  }, [active]);

  return (
    <nav aria-label={label}>
      <div ref={trackRef} className={styles.track}>
        <span ref={pillRef} className={styles.pill} aria-hidden="true" />
        {options.map((option) => (
          <Link
            key={option.value}
            href={option.href}
            data-value={option.value}
            className={styles.item}
            aria-current={option.value === active ? "page" : undefined}
            scroll={false}
            onClick={() => setClicked({ from: value, to: option.value })}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={styles.count}>{option.count}</span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
