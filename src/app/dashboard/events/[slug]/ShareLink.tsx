"use client";

import { useEffect, useRef, useState } from "react";
import buttons from "@/components/buttons.module.css";
import styles from "./overview.module.css";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  return (
    <div className={styles.share}>
      <label className="sr-only" htmlFor="public-link">
        Public link
      </label>
      <input
        id="public-link"
        ref={inputRef}
        className={styles.shareInput}
        value={url}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className={styles.shareActions}>
        <button type="button" className={`${buttons.btn} ${styles.copy}`} onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <a className={`${buttons.btn} ${buttons.ghost}`} href={url} target="_blank" rel="noopener noreferrer">
          Open
          <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
