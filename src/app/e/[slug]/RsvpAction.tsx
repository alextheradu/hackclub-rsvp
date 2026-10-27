"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import buttons from "@/components/buttons.module.css";
import type { RsvpButtonState } from "@/lib/rsvp-state";
import { cancelAction, rsvpAction, type RsvpFormState } from "./actions";
import styles from "./page.module.css";

type Props = {
  slug: string;
  state: RsvpButtonState;
  capacity: number | null;
  confirmedCount: number;
  waitlistedCount: number;
};

const NOTES: Partial<Record<RsvpButtonState, string>> = {
  confirmed: "You're going.",
  waitlisted: "You're on the waitlist. We'll put you in if a spot opens.",
  full: "This event is full. Join the waitlist and you'll get put in if a spot opens.",
  closed: "RSVPs are closed.",
};

function SubmitButton({ idle, pending, variant }: { idle: string; pending: string; variant: "primary" | "ghost" }) {
  const status = useFormStatus();

  return (
    <button
      type="submit"
      className={`${buttons.btn} ${buttons[variant]}`}
      disabled={status.pending}
    >
      {status.pending ? pending : idle}
    </button>
  );
}

export function RsvpAction({ slug, state, capacity, confirmedCount, waitlistedCount }: Props) {
  const [form, formAction] = useActionState(rsvpAction.bind(null, slug), {
    message: null,
  } as RsvpFormState);

  if (state === "cancelled") return null;

  const spotsLeft = capacity === null ? null : Math.max(capacity - confirmedCount, 0);

  return (
    <div className={styles.action}>
      <p className={styles.spots}>
        {capacity === null
          ? `${confirmedCount} going`
          : `${spotsLeft} of ${capacity} spots left`}
        {waitlistedCount > 0 && ` · ${waitlistedCount} waitlisted`}
      </p>

      {state === "open" || state === "signed_out" || state === "full" ? (
        <form action={formAction}>
          <SubmitButton
            idle={state === "full" ? "Join waitlist" : "RSVP"}
            pending="One sec…"
            variant="primary"
          />
        </form>
      ) : null}

      {state === "confirmed" || state === "waitlisted" ? (
        <form action={cancelAction.bind(null, slug)}>
          <SubmitButton
            idle={state === "confirmed" ? "Cancel RSVP" : "Leave waitlist"}
            pending="Cancelling…"
            variant="ghost"
          />
        </form>
      ) : null}

      {form.message && (
        <p className={styles.soon} role="alert">
          {form.message}
        </p>
      )}

      {NOTES[state] && <p className={styles.soon}>{NOTES[state]}</p>}
    </div>
  );
}
