"use client";

import { useState, startTransition, useActionState, useMemo } from "react";
import buttons from "@/components/buttons.module.css";
import type { EventFormValues } from "@/lib/event-form";
import type { EventKind } from "@/lib/slug";
import {
  EventFields,
  useFocusError,
  type FieldError,
} from "../../_components/EventFields";
import form from "../../_components/form.module.css";
import { updateEventAction, type UpdateEventState } from "../actions";
import styles from "../settings.module.css";

type Props = {
  slug: string;
  kind: EventKind;
  initial: EventFormValues;
};

export function EditEventForm({ slug, kind, initial }: Props) {
  const [state, formAction, pending] = useActionState<
    UpdateEventState,
    FormData
  >(updateEventAction.bind(null, slug), { error: null, saved: null });
  const error: FieldError = useMemo(
    () =>
      state.error && state.field
        ? { field: state.field, message: state.error }
        : null,
    [state],
  );
  useFocusError(error);
  const [dirty, setDirty] = useState(false);

  return (
    <form
      method="post"
      className={form.form}
      onChange={() => setDirty(true)}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        setDirty(false);
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
          {!pending && !dirty && state.saved}
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
