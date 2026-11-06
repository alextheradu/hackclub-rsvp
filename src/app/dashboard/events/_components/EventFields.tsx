"use client";

import { useEffect, type ReactNode } from "react";
import type { EventFormValues } from "@/lib/event-form";
import type { EventKind } from "@/lib/slug";
import { useTimeZones } from "@/lib/use-time-zones";
import styles from "./form.module.css";

export type FieldError = { field: string; message: string } | null;

export function invalidProps(name: string, error: FieldError) {
  return error?.field === name
    ? { "aria-invalid": true, "aria-describedby": `${name}-error` }
    : {};
}

export function ErrorText({
  name,
  error,
}: {
  name: string;
  error: FieldError;
}) {
  if (error?.field !== name) return null;
  return (
    <p id={`${name}-error`} className={styles.fieldError}>
      {error.message}
    </p>
  );
}

export function useFocusError(error: FieldError) {
  useEffect(() => {
    if (error) document.getElementById(error.field)?.focus();
  }, [error]);
}

type Props = {
  kind: EventKind;
  values: EventFormValues;
  error: FieldError;
  afterTitle?: ReactNode;
  onTitleChange?: (title: string) => void;
  capacityHint?: string;
};

export function EventFields({
  kind,
  values,
  error,
  afterTitle,
  onTitleChange,
  capacityHint = "When it's full, new RSVPs join the waitlist.",
}: Props) {
  const zones = useTimeZones();

  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          className={styles.input}
          defaultValue={values.title}
          maxLength={120}
          required
          autoComplete="off"
          onChange={
            onTitleChange && ((event) => onTitleChange(event.target.value))
          }
          {...invalidProps("title", error)}
        />
        <ErrorText name="title" error={error} />
      </div>

      {afterTitle}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="startsLocal">
            Starts
          </label>
          <input
            id="startsLocal"
            name="startsLocal"
            type="datetime-local"
            className={styles.input}
            defaultValue={values.startsLocal}
            required
            {...invalidProps("startsLocal", error)}
          />
          <ErrorText name="startsLocal" error={error} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="endsLocal">
            Ends <span className={styles.optional}>optional</span>
          </label>
          <input
            id="endsLocal"
            name="endsLocal"
            type="datetime-local"
            className={styles.input}
            defaultValue={values.endsLocal}
            {...invalidProps("endsLocal", error)}
          />
          <ErrorText name="endsLocal" error={error} />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="timezone">
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            list="timezones"
            className={styles.input}
            defaultValue={values.timezone}
            autoComplete="off"
            spellCheck={false}
            required
            {...invalidProps("timezone", error)}
          />
          <datalist id="timezones">
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p className={styles.hint}>
            Start and end times are in this timezone.
          </p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="capacity">
            Capacity <span className={styles.optional}>optional</span>
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            className={styles.input}
            defaultValue={values.capacity}
            placeholder="No limit"
            {...invalidProps("capacity", error)}
          />
          {error?.field === "capacity" ? (
            <ErrorText name="capacity" error={error} />
          ) : (
            <p className={styles.hint}>{capacityHint}</p>
          )}
        </div>
      </div>

      {kind === "ysws" ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="website">
            Program website <span className={styles.optional}>optional</span>
          </label>
          <input
            id="website"
            name="website"
            type="url"
            className={styles.input}
            defaultValue={values.website}
            placeholder="https://"
            {...invalidProps("website", error)}
          />
          <ErrorText name="website" error={error} />
        </div>
      ) : (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="locationDisplay">
              Where <span className={styles.optional}>optional</span>
            </label>
            <input
              id="locationDisplay"
              name="locationDisplay"
              className={styles.input}
              defaultValue={values.locationDisplay}
              placeholder="Brooklyn, NY"
              maxLength={160}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onlineUrl">
              Online link <span className={styles.optional}>optional</span>
            </label>
            <input
              id="onlineUrl"
              name="onlineUrl"
              type="url"
              className={styles.input}
              defaultValue={values.onlineUrl}
              placeholder="https://"
              {...invalidProps("onlineUrl", error)}
            />
            <ErrorText name="onlineUrl" error={error} />
          </div>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="description">
          Description <span className={styles.optional}>optional</span>
        </label>
        <textarea
          id="description"
          name="description"
          className={`${styles.input} ${styles.textarea}`}
          defaultValue={values.description}
          rows={4}
          maxLength={4000}
        />
      </div>
    </div>
  );
}
