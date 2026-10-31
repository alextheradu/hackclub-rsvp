export type EmailKind = "rsvp_confirmed" | "rsvp_waitlisted" | "waitlist_promoted" | "event_reminder";

export type EmailContext = {
  name: string | null;
  eventTitle: string;
  orgName: string;
  when: string;
  url: string;
};

const COPY: Record<EmailKind, { subject: (title: string) => string; body: string }> = {
  rsvp_confirmed: {
    subject: (title) => `You're going to ${title}`,
    body: "You're on the list. See you there!",
  },
  rsvp_waitlisted: {
    subject: (title) => `You're on the waitlist for ${title}`,
    body: "The event is full right now. If a spot opens, we'll move you in automatically and email you.",
  },
  waitlist_promoted: {
    subject: (title) => `A spot opened up: you're going to ${title}`,
    body: "Someone dropped out, so you've been moved off the waitlist. You're going!",
  },
  event_reminder: {
    subject: (title) => `Tomorrow: ${title}`,
    body: "Just a reminder that the event is tomorrow. See you there!",
  },
};

export function isEmailKind(kind: string): kind is EmailKind {
  return Object.hasOwn(COPY, kind);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmail(kind: EmailKind, ctx: EmailContext) {
  const copy = COPY[kind];
  const greeting = ctx.name ? `Hey ${ctx.name},` : "Hey,";
  const cancel = "Can't make it? Cancel from the event page so someone else can have your spot.";
  const showCancel = kind !== "rsvp_waitlisted";

  const text = [
    greeting,
    "",
    copy.body,
    "",
    `${ctx.eventTitle}`,
    `${ctx.orgName} · ${ctx.when}`,
    ctx.url,
    ...(showCancel ? ["", cancel] : []),
  ].join("\n");

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(copy.body)}</p>`,
    `<p><strong>${escapeHtml(ctx.eventTitle)}</strong><br>${escapeHtml(ctx.orgName)} · ${escapeHtml(ctx.when)}</p>`,
    `<p><a href="${escapeHtml(ctx.url)}">View event</a></p>`,
    ...(showCancel ? [`<p style="color:#666">${escapeHtml(cancel)}</p>`] : []),
  ].join("\n");

  return { subject: copy.subject(ctx.eventTitle), text, html };
}
