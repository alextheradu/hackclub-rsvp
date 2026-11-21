import { getPool, q, sql, type Queryable } from "@/lib/db";
import { enqueue } from "@/lib/outbox";

// New sign-ins are invited once to the organizer channel. The channel is
// captured in the job so a later env change doesn't redirect queued invites.
export async function onFirstLogin(
  user: { id: number; isNew: boolean },
  slackId: string | null | undefined,
  channelId: string | undefined = process.env.SLACK_ORGANIZER_CHANNEL_ID,
  db: Queryable = getPool(),
): Promise<boolean> {
  if (!user.isNew || !slackId || !channelId) return false;
  return enqueue(db, {
    channel: "slack",
    kind: "organizer_invite",
    payload: { userId: user.id, channelId },
    dedupeKey: `organizer_invite:${user.id}`,
  });
}

// Backfill for people who signed up before invites existed, or whose first
// login had no Slack ID. Shares onFirstLogin's dedupe key, and outbox rows are
// never deleted, so running it on every startup invites each person once.
export async function inviteExistingUsers(
  channelId: string | undefined = process.env.SLACK_ORGANIZER_CHANNEL_ID,
  db: Queryable = getPool(),
): Promise<number> {
  if (!channelId) return 0;
  return q(db).exec(sql`
    INSERT INTO outbox (channel, kind, payload, dedupe_key)
    SELECT 'slack', 'organizer_invite',
           jsonb_build_object('userId', u.id, 'channelId', ${channelId}::text),
           'organizer_invite:' || u.id
    FROM users u
    WHERE u.slack_id IS NOT NULL
    ORDER BY u.id
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`);
}
