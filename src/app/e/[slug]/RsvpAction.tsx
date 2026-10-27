import buttons from "@/components/buttons.module.css";
import type { RsvpButtonState } from "@/lib/rsvp-state";
import { cancelAction, rsvpAction } from "./actions";
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

export function RsvpAction({ slug, state, capacity, confirmedCount, waitlistedCount }: Props) {
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

      {state === "open" || state === "signed_out" ? (
        <form action={rsvpAction.bind(null, slug)}>
          <button type="submit" className={`${buttons.btn} ${buttons.primary}`}>
            RSVP
          </button>
        </form>
      ) : null}

      {state === "full" ? (
        <form action={rsvpAction.bind(null, slug)}>
          <button type="submit" className={`${buttons.btn} ${buttons.primary}`}>
            Join waitlist
          </button>
        </form>
      ) : null}

      {state === "confirmed" || state === "waitlisted" ? (
        <form action={cancelAction.bind(null, slug)}>
          <button type="submit" className={`${buttons.btn} ${buttons.ghost}`}>
            {state === "confirmed" ? "Cancel RSVP" : "Leave waitlist"}
          </button>
        </form>
      ) : null}

      {NOTES[state] && <p className={styles.soon}>{NOTES[state]}</p>}
    </div>
  );
}
