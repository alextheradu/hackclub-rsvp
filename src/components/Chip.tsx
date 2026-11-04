import type { ReactNode } from "react";
import styles from "./Chip.module.css";

export type ChipTone = "neutral" | "green" | "yellow" | "cyan" | "orange" | "red";

type Props = {
  tone?: ChipTone;
  tilt?: boolean;
  children: ReactNode;
};

export function Chip({ tone = "neutral", tilt = true, children }: Props) {
  return (
    <span className={styles.chip} data-tone={tone} data-tilt={tilt || undefined}>
      {children}
    </span>
  );
}
