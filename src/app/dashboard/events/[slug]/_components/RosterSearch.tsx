"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { rosterHref, type RosterStatus } from "@/lib/roster-filter";
import styles from "../roster.module.css";

const DELAY_MS = 250;
const MAX_LENGTH = 100;

type Props = {
  base: string;
  status?: RosterStatus;
  q: string;
};

// Without JS this is a plain GET form. With JS it searches as you type.
export function RosterSearch({ base, status, q }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(q);
  const [sent, setSent] = useState(q);
  const [seen, setSeen] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL changed without us (back button, the empty state's Clear search link).
  if (q !== seen) {
    setSeen(q);
    if (q !== sent) {
      setSent(q);
      setValue(q);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function send(next: string) {
    clearTimeout(timer.current);
    const search = next.trim().slice(0, MAX_LENGTH);
    if (search === sent) return;
    setSent(search);
    startTransition(() => {
      router.replace(rosterHref(base, { status, q: search || undefined }), { scroll: false });
    });
  }

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(next), DELAY_MS);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && value) {
      event.preventDefault();
      setValue("");
      send("");
    }
  }

  return (
    <form
      className={styles.search}
      role="search"
      action={base}
      onSubmit={onSubmit}
      aria-busy={isPending}
      data-pending={isPending || undefined}
    >
      {status && <input type="hidden" name="status" value={status} />}
      <label className={styles.searchField}>
        <span className="sr-only">Search RSVPs</span>
        <input
          className={styles.input}
          type="search"
          name="q"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Name, email or Slack ID"
          maxLength={MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <span className={styles.spinner} aria-hidden="true" />
      </label>
      {value && (
        <Link
          className={styles.clear}
          href={rosterHref(base, { status })}
          replace
          scroll={false}
          onClick={() => {
            clearTimeout(timer.current);
            setValue("");
            setSent("");
          }}
        >
          Clear
        </Link>
      )}
    </form>
  );
}
