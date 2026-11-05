"use client";

import buttons from "@/components/buttons.module.css";
import styles from "../not-found.module.css";

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <main className={styles.page}>
      <p className={styles.code}>Error</p>
      <h1 className={styles.title}>That didn&apos;t load.</h1>
      <p className={styles.sub}>
        Something went wrong on our side. Try again in a moment. If it keeps happening, include the code
        below when you report it.
      </p>
      {digest && <p className={styles.digest}>{digest}</p>}
      <div className={styles.actions}>
        <button type="button" className={`${buttons.btn} ${buttons.primary}`} onClick={() => retry()}>
          Try again
        </button>
        <a className={`${buttons.btn} ${buttons.ghost}`} href="/dashboard">
          Your events
        </a>
      </div>
    </main>
  );
}
