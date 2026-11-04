"use client";

import { useActionState, useState } from "react";
import buttons from "@/components/buttons.module.css";
import { cancelEventAction, type CancelEventState } from "./actions";
import styles from "./roster.module.css";

const INITIAL: CancelEventState = { error: null };

type Props = {
  slug: string;
  notifyCount: number;
};

export function CancelEventButton({ slug, notifyCount }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(cancelEventAction.bind(null, slug), INITIAL);

  if (!confirming) {
    return (
      <button
        type="button"
        className={`${buttons.btn} ${buttons.ghost} ${buttons.danger}`}
        onClick={() => setConfirming(true)}
      >
        Cancel event
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className={styles.confirm}
      aria-busy={pending}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) setConfirming(false);
      }}
    >
      <p className={styles.confirmText}>
        {notifyCount === 0
          ? "Nobody has RSVPed yet. This can't be undone."
          : `${notifyCount} ${notifyCount === 1 ? "person gets" : "people get"} a cancellation email. This can't be undone.`}
      </p>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <div className={styles.confirmActions}>
        <button
          type="button"
          className={`${buttons.btn} ${buttons.ghost}`}
          onClick={() => setConfirming(false)}
          disabled={pending}
          autoFocus
        >
          Keep event
        </button>
        <button
          type="submit"
          className={`${buttons.btn} ${buttons.primary}`}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
      </div>
    </form>
  );
}
