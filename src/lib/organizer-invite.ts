import { getPool, type Queryable } from "@/lib/db";
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
