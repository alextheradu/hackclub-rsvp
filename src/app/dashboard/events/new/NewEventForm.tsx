"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import buttons from "@/components/buttons.module.css";
import type { OrgSummary } from "@/lib/events";
import { eventUrl, slugify, validateSlug, type EventKind, type SlugStatus } from "@/lib/slug";
import {
  ErrorText,
  EventFields,
  invalidProps,
  useFocusError,
  type FieldError,
} from "../_components/EventFields";
import styles from "../_components/form.module.css";
import { createEventAction, type FormState } from "./actions";

const INITIAL: FormState = { values: {} };

const SLUG_PROBLEM: Partial<Record<SlugStatus, string>> = {
  reserved: "That URL name is reserved. Try another.",
  taken: "That URL name is already taken. Try another.",
};

function useSlugStatus(slug: string): SlugStatus | null {
  const [remote, setRemote] = useState<{ slug: string; status: SlugStatus } | null>(null);
  const local = slug ? validateSlug(slug) : null;

  useEffect(() => {
    if (!slug || !validateSlug(slug).ok) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/dashboard/events/new/slug-check?slug=${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { status: SlugStatus };
        setRemote({ slug, status: body.status });
      } catch {
        // Aborted or offline. The server checks again on submit.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug]);

  if (!local) return null;
  if (!local.ok) return local.reason;
  return remote?.slug === slug ? remote.status : null;
}

export function NewEventForm({ orgs, root }: { orgs: OrgSummary[]; root: string }) {
  const [state, formAction, pending] = useActionState(createEventAction, INITIAL);
  const { values } = state;
  const error: FieldError = useMemo(
    () => (state.error && state.field ? { field: state.field, message: state.error } : null),
    [state],
  );
  useFocusError(error);

  const [kind, setKind] = useState<EventKind>(values.kind === "irl" ? "irl" : "ysws");
  const [title, setTitle] = useState(values.title ?? "");
  const [slug, setSlug] = useState(values.slug ?? "");
  const [org, setOrg] = useState(values.org ?? String(orgs[0]?.id ?? "new"));

  useEffect(() => {
    const input = document.getElementById("timezone") as HTMLInputElement | null;
    if (input && !input.value) {
      input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  const effectiveSlug = slug || slugify(title);
  const slugStatus = useSlugStatus(effectiveSlug);
  const submittedSlug = values.slug?.trim() || slugify(values.title ?? "");
  const showServerSlugError = error?.field === "slug" && effectiveSlug === submittedSlug;
  const makingNewOrg = orgs.length === 0 || org === "new";
  const hiddenFields = [
    ...(kind === "ysws" ? ["locationDisplay", "onlineUrl"] : ["website"]),
    ...(makingNewOrg ? []: ["orgName"]),
  ];
  const errorAtBottom = Boolean(state.error) && (!state.field || hiddenFields.includes(state.field));

  const slugField = (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="slug">
        URL name
      </label>
      <input
        id="slug"
        name="slug"
        className={`${styles.input} ${styles.mono}`}
        value={slug}
        placeholder={slugify(title) || "my-event"}
        maxLength={40}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={showServerSlugError || Boolean(slugStatus && SLUG_PROBLEM[slugStatus])}
        aria-describedby="slug-hint"
        onChange={(event) => setSlug(event.target.value.toLowerCase())}
      />
      <p id="slug-hint" className={styles.hint} aria-live="polite">
        {showServerSlugError ? (
          <span className={styles.fieldError}>{error.message}</span>
        ) : slugStatus && SLUG_PROBLEM[slugStatus] ? (
          <span className={styles.fieldError}>{SLUG_PROBLEM[slugStatus]}</span>
        ) : slugStatus === "format" || !effectiveSlug ? (
          "Lowercase letters, numbers and hyphens, 3 to 40 characters."
        ) : (
          <>
            <span className={styles.mono}>{eventUrl({ kind, slug: effectiveSlug }, root)}</span>
            {slugStatus === "ok" && <span className={styles.available}> · Available</span>}
          </>
        )}
      </p>
    </div>
  );

  return (
    <form
      method="post"
      className={styles.sections}
      aria-busy={pending}
      onSubmit={(event) => {
        // A transition keeps what was typed if the server sends back an error.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <section className={styles.section} aria-labelledby="kind-heading">
        <div>
          <h2 id="kind-heading" className={styles.sectionTitle}>
            Kind
          </h2>
          <p className={styles.sectionText}>Decides what the event page asks for. You can&apos;t change it later.</p>
        </div>
        <div className={styles.field}>
          <div className={styles.kinds} role="radiogroup" aria-labelledby="kind-heading">
            <label className={styles.kind}>
              <input
                id="kind"
                type="radio"
                name="kind"
                value="ysws"
                checked={kind === "ysws"}
                onChange={() => setKind("ysws")}
              />
              <span className={styles.kindName}>YSWS program</span>
              <span className={styles.kindHint}>Online, with a program website</span>
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
              <span className={styles.kindHint}>In person, with a place</span>
            </label>
          </div>
          <ErrorText name="kind" error={error} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="details-heading">
        <div>
          <h2 id="details-heading" className={styles.sectionTitle}>
            Details
          </h2>
          <p className={styles.sectionText}>Shown on the public page. You can edit these later.</p>
        </div>
        <EventFields
          kind={kind}
          values={values}
          error={error}
          afterTitle={slugField}
          onTitleChange={setTitle}
        />
      </section>

      <section className={styles.section} aria-labelledby="org-heading">
        <div>
          <h2 id="org-heading" className={styles.sectionTitle}>
            Organization
          </h2>
          <p className={styles.sectionText}>Events belong to an organization, so you can add organizers later.</p>
        </div>
        <div className={styles.fields}>
          {orgs.length > 0 && (
            <div className={styles.field}>
              <label className="sr-only" htmlFor="org">
                Organization
              </label>
              <select
                id="org"
                name="org"
                className={styles.input}
                value={org}
                onChange={(event) => setOrg(event.target.value)}
                {...invalidProps("org", error)}
              >
                {orgs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
                <option value="new">New organization…</option>
              </select>
              <ErrorText name="org" error={error} />
            </div>
          )}

          {makingNewOrg && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="orgName">
                {orgs.length > 0 ? "New organization name" : "Organization name"}{" "}
                <span className={styles.optional}>optional</span>
              </label>
              <input
                id="orgName"
                name="orgName"
                className={styles.input}
                defaultValue={values.orgName}
                placeholder="Defaults to your name"
                maxLength={80}
                {...invalidProps("orgName", error)}
              />
              <ErrorText name="orgName" error={error} />
            </div>
          )}
        </div>
      </section>

      <div className={styles.footer}>
        {errorAtBottom && (
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
      </div>
    </form>
  );
}
