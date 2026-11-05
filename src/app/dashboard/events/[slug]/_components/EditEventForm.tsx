"use client";

import { startTransition, useActionState, useMemo } from "react";
import buttons from "@/components/buttons.module.css";
import type { EventFormValues } from "@/lib/event-form";
import type { EventKind } from "@/lib/slug";
import { EventFields, useFocusError, type FieldError } from "../../_components/EventFields";
import form from "../../_components/form.module.css";
import { updateEventAction, type UpdateEventState } from "../actions";
import styles from "../settings.module.css";

type Props = {
  slug: string;
  kind: EventKind;
  initial: EventFormValues;
};

export function EditEventForm({ slug, kind, initial }: Props) {
  const [state, formAction, pending] = useActionState<UpdateEventState, FormData>(
    updateEventAction.bind(null, slug),
    { error: null, saved: null },
  );
  const error: FieldError = useMemo(
    () => (state.error && state.field ? { field: state.field, message: state.error } : null),
    [state],
  );
  useFocusError(error);

  return (
    <form
      method="post"
      className={form.form}
      aria-busy={pending}
      onSubmit={(event) => {
        // Submitting through a transition keeps what was typed. A plain form
        // action would reset the fields to their defaults after saving.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <EventFields
        kind={kind}
        values={initial}
        error={error}
        capacityHint="Raising it moves people off the waitlist."
      />

      {state.error && !state.field && (
        <p className={form.error} role="alert">
          {state.error}
        </p>
      )}

      <div className={styles.saveRow}>
        <p className={styles.saved} role="status">
          {!pending && state.saved}
        </p>
        <button
          type="submit"
          className={`${buttons.btn} ${buttons.primary}`}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
