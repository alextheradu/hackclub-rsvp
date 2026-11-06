"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./Tabs.module.css";

export type TabItem = {
  href: string;
  label: string;
  count?: number;
  exact?: boolean;
};

type Props = {
  label: string;
  items: TabItem[];
};

function matches(item: TabItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Tabs({ label, items }: Props) {
  const pathname = usePathname();
  const [clicked, setClicked] = useState<{ from: string; to: string } | null>(
    null,
  );
  const current = items.find((item) => matches(item, pathname))?.href ?? null;
  const active = clicked && clicked.from === pathname ? clicked.to : current;
  const listRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const line = lineRef.current;
    if (!list || !line) return;

    const place = () => {
      const item = active
        ? list.querySelector<HTMLElement>(`[data-href="${CSS.escape(active)}"]`)
        : null;
      if (!item) {
        delete list.dataset.ready;
        return;
      }
      const style = getComputedStyle(item);
      const left = item.offsetLeft + parseFloat(style.paddingLeft);
      const right =
        list.clientWidth -
        item.offsetLeft -
        item.offsetWidth +
        parseFloat(style.paddingRight);
      line.style.clipPath = `inset(0 ${right}px 0 ${left}px)`;
      list.dataset.ready = "true";
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active]);

  return (
    <nav aria-label={label} className={styles.nav}>
      <div ref={listRef} className={styles.list}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-href={item.href}
            className={styles.tab}
            aria-current={item.href === active ? "page" : undefined}
            onClick={() => setClicked({ from: pathname, to: item.href })}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={styles.count}>{item.count}</span>
            )}
          </Link>
        ))}
        <span ref={lineRef} className={styles.line} aria-hidden="true" />
      </div>
    </nav>
  );
}
