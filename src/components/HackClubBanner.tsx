"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./HackClubBanner.module.css";

const MAX_ROTATE_DEG = 10;
const MAX_SKEW_DEG = 3;
const EASE = 0.12;

export default function HackClubBanner() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const link = linkRef.current;
    if (!wrap || !link) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const current = { rotate: 0, skew: 0 };
    const target = { rotate: 0, skew: 0 };
    let raf = 0;

    const frame = () => {
      current.rotate += (target.rotate - current.rotate) * EASE;
      current.skew += (target.skew - current.skew) * EASE;
      link.style.transform = `rotate(${current.rotate}deg) skewX(${current.skew}deg)`;
      const settled =
        Math.abs(target.rotate - current.rotate) < 0.01 &&
        Math.abs(target.skew - current.skew) < 0.01;
      raf = settled ? 0 : requestAnimationFrame(frame);
    };

    const onPointerMove = (event: PointerEvent) => {
      // measure the static wrapper, the link itself is rotating
      const box = wrap.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
      const clamped = Math.max(-1, Math.min(1, dx));
      target.rotate = -clamped * MAX_ROTATE_DEG;
      target.skew = clamped * MAX_SKEW_DEG;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <a ref={linkRef} className={styles.link} href="https://hackclub.com" aria-label="Hack Club">
        <Image
          src="/hackclub-flag.svg"
          alt=""
          width={280}
          height={158}
          unoptimized
          priority
          className={styles.image}
        />
      </a>
    </div>
  );
}
