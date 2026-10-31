import { getPool } from "@/lib/db";
import { rootDomain } from "@/lib/domain";
import { isEmailKind, renderEmail, type EmailKind } from "@/lib/email-templates";
import { formatEventWhen } from "@/lib/format";
import type { MailTransport } from "@/lib/mail";
import type { Sender } from "@/lib/outbox-worker";
import { eventUrl } from "@/lib/slug";

const WANTED_STATUS: Record<EmailKind, string> = {
  rsvp_confirmed: "confirmed",
  rsvp_waitlisted: "waitlisted",
  waitlist_promoted: "confirmed",
  event_reminder: "confirmed",
};

export function emailSender(transport: MailTransport, from: string): Sender {
  return async (job) => {
    if (!isEmailKind(job.kind)) throw new Error(`unknown email kind: ${job.kind}`);

    const { rows } = await getPool().query(
      `SELECT r.status, r.notifications_enabled, u.email, u.name,
              e.slug, e.kind, e.title, e.starts_at, e.ends_at, e.timezone, e.cancelled_at,
              o.name AS org_name
       FROM rsvps r
       JOIN users u ON u.id = r.user_id
       JOIN events e ON e.id = r.event_id
       JOIN orgs o ON o.id = e.org_id
       WHERE r.id = $1`,
      [job.payload.rsvpId],
    );
    const row = rows[0];
    if (!row) return;
    if (!row.notifications_enabled || row.cancelled_at) return;
    if (row.status !== WANTED_STATUS[job.kind]) return;

    const mail = renderEmail(job.kind, {
      name: row.name,
      eventTitle: row.title,
      orgName: row.org_name,
      when: formatEventWhen(row.starts_at, row.ends_at, row.timezone),
      url: eventUrl(row, rootDomain()),
    });
    await transport.sendMail({ from, to: row.email, ...mail });
  };
}
