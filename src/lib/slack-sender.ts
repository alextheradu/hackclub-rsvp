import { checkEligibility, type Eligibility } from "@/lib/eligibility";
import { inviteToChannel, postDm, SlackError } from "@/lib/slack";
import { q, sql } from "@/lib/db";
import { rootDomain } from "@/lib/domain";
import { WANTED_STATUS } from "@/lib/email-sender";
import {
  renderEmail,
  type EmailKind,
  isEmailKind,
} from "@/lib/email-templates";
import { formatEventWhen } from "@/lib/format";
import { eventUrl, type EventKind } from "@/lib/slug";
import type { Sender } from "@/lib/outbox-worker";

export type SlackDeps = {
  postDm: (slackId: string, text: string) => Promise<void>;
  inviteToChannel: (
    channelId: string,
    slackId: string,
  ) => Promise<"ok" | "already_in">;
  checkEligibility: (slackId: string) => Promise<Eligibility>;
};

const REAL: SlackDeps = { postDm, inviteToChannel, checkEligibility };

function escapeSlack(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type SlackRow = {
  status: string;
  notifications_enabled: boolean;
  slack_id: string | null;
  slug: string;
  kind: EventKind;
  title: string;
  starts_at: Date;
  ends_at: Date | null;
  timezone: string;
  cancelled_at: Date | null;
  slack_channel_id: string | null;
  requires_verification: boolean;
  org_name: string;
};

async function loadRsvp(rsvpId: unknown): Promise<SlackRow | undefined> {
  return q().maybe<SlackRow>(sql`
    SELECT r.status, r.notifications_enabled, u.slack_id,
           e.slug, e.kind, e.title, e.starts_at, e.ends_at, e.timezone,
           e.cancelled_at, e.slack_channel_id, e.requires_verification,
           o.name AS org_name
    FROM rsvps r
    JOIN users u ON u.id = r.user_id
    JOIN events e ON e.id = r.event_id
    JOIN orgs o ON o.id = e.org_id
    WHERE r.id = ${rsvpId}`);
}

async function sendInvite(row: SlackRow, deps: SlackDeps): Promise<void> {
  if (!row.slack_id || !row.slack_channel_id) return;
  if (row.cancelled_at || row.status !== "confirmed") return;
  if (row.requires_verification) {
    const result = await deps.checkEligibility(row.slack_id);
    if (result !== "eligible")
      throw new SlackError(`not_eligible_${result}`, false);
  }
  await deps.inviteToChannel(row.slack_channel_id, row.slack_id);
}

async function sendDm(
  kind: EmailKind,
  row: SlackRow,
  deps: SlackDeps,
): Promise<void> {
  if (!row.slack_id || !row.notifications_enabled) return;
  if (row.cancelled_at && kind !== "event_cancelled") return;
  if (!WANTED_STATUS[kind].includes(row.status)) return;

  const url = eventUrl(row, rootDomain());
  const mail = renderEmail(kind, {
    name: null,
    eventTitle: escapeSlack(row.title),
    orgName: escapeSlack(row.org_name),
    when: formatEventWhen(row.starts_at, row.ends_at, row.timezone),
    url,
  });
  await deps.postDm(row.slack_id, `*${mail.subject}*\n${url}`);
}

export function slackSender(deps: SlackDeps = REAL): Sender {
  return async (job) => {
    if (job.kind !== "channel_invite" && !isEmailKind(job.kind)) {
      throw new SlackError(`unknown_kind_${job.kind}`, false);
    }
    const row = await loadRsvp(job.payload.rsvpId);
    if (!row) return;
    if (job.kind === "channel_invite") return sendInvite(row, deps);
    return sendDm(job.kind, row, deps);
  };
}
