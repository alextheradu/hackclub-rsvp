"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import buttons from "@/components/buttons.module.css";
import type { OrgSummary } from "@/lib/events";
import { eventUrl, slugify, type EventKind } from "@/lib/slug";
import { createEventAction, type FormState } from "./actions";
import styles from "./form.module.css";

const INITIAL: FormState = { values: {} };

let zonesCache: string[] | null = null;
function getZones(): string[] {
  zonesCache ??= ["UTC", ...Intl.supportedValuesOf("timeZone")];
  return zonesCache;
}
const NO_ZONES: string[] = [];
const subscribeNothing = () => () => {};

export function NewEventForm({ orgs }: { orgs: OrgSummary[] }) {
  const [state, formAction, pending] = useActionState(createEventAction, INITIAL);
  const { values } = state;

  const [kind, setKind] = useState<EventKind>(values.kind === "irl" ? "irl" : "ysws");
  const [title, setTitle] = useState(values.title ?? "");
  const [slug, setSlug] = useState(values.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(values.slug));
  const [org, setOrg] = useState(values.org ?? String(orgs[0]?.id ?? "new"));
  const timezoneRef = useRef<HTMLInputElement>(null);
  const zones = useSyncExternalStore(subscribeNothing, getZones, () => NO_ZONES);

  useEffect(() => {
    const input = timezoneRef.current;
    if (input && !input.value) {
      input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  const effectiveSlug = slug || slugify(title);
  const makingNewOrg = orgs.length === 0 || org === "new";

  return (
    <form
      method="post"
      className={styles.form}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className={styles.kinds} role="radiogroup" aria-labelledby="kind-label">
        <span id="kind-label" className={styles.label}>
          What are you running?
        </span>
        <label className={styles.kind}>
          <input
            type="radio"
            name="kind"
            value="ysws"
            checked={kind === "ysws"}
            onChange={() => setKind("ysws")}
          />
          <span className={styles.kindName}>YSWS program</span>
          <span className={styles.kindHint}>Online. Lives at your-name.hackclub.rsvp</span>
        </label>
        <label className={styles.kind}>
          <input
            type="radio"
            name="kind"
            value="irl"
            checked={kind === "irl"}
            onChange={() => setKind("irl")}
          />
          <span className={styles.kindName}>IRL event</span>
          <span className={styles.kindHint}>In person. Lives at events.hackclub.rsvp/your-name</span>
        </label>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          className={styles.input}
          value={title}
          maxLength={120}
          required
          autoComplete="off"
          onChange={(event) => {
            setTitle(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="slug">
          URL name
        </label>
        <input
          id="slug"
          name="slug"
          className={`${styles.input} ${styles.mono}`}
          value={slug}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value.toLowerCase());
          }}
        />
        <p className={styles.hint}>
          {effectiveSlug ? (
            <span className={styles.mono}>{eventUrl({ kind, slug: effectiveSlug })}</span>
          ) : (
            "Lowercase letters, numbers and hyphens, 3 to 40 characters."
          )}
        </p>
      </div>

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
          />
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
          />
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
            ref={timezoneRef}
            list="timezones"
            className={styles.input}
            defaultValue={values.timezone}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <datalist id="timezones">
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
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
          />
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
          />
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
            />
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

      {orgs.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="org">
            Organization
          </label>
          <select
            id="org"
            name="org"
            className={styles.input}
            value={org}
            onChange={(event) => setOrg(event.target.value)}
          >
            {orgs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="new">New organization…</option>
          </select>
        </div>
      )}

      {makingNewOrg && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="orgName">
            Organization name <span className={styles.optional}>optional</span>
          </label>
          <input
            id="orgName"
            name="orgName"
            className={styles.input}
            defaultValue={values.orgName}
            placeholder="Defaults to your name"
            maxLength={80}
          />
          <p className={styles.hint}>Events belong to an organization, so you can add organizers later.</p>
        </div>
      )}

      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}

      <div className={styles.actions}>
        <a className={`${buttons.btn} ${buttons.ghost}`} href="/dashboard">
          Cancel
        </a>
        <button
          type="submit"
          className={`${buttons.btn} ${buttons.primary}`}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Creating…" : "Create event"}
        </button>
      </div>
    </form>
  );
}
