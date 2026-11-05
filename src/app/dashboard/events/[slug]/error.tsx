"use client";

import buttons from "@/components/buttons.module.css";
import styles from "./layout.module.css";

export default function EventTabError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div className={styles.tabError} role="alert">
      <p className={styles.tabErrorTitle}>This tab didn&apos;t load.</p>
      <p className={styles.tabErrorText}>
        Try again in a moment.
        {digest && (
          <>
            {" "}
            Code <span className={styles.tabErrorCode}>{digest}</span>
          </>
        )}
      </p>
      <button type="button" className={buttons.btn} onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
