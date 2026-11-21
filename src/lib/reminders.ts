import { q, sql } from "@/lib/db";

export async function queueReminders(): Promise<number> {
  return q().exec(sql`
        INSERT INTO outbox (channel, kind, payload, dedupe_key)
        SELECT c.channel, 'event_reminder', json_build_object('rsvpId', r.id), c.key_prefix || r.id
        FROM rsvps r
        JOIN events e ON e.id = r.event_id
        CROSS JOIN (VALUES ('email', 'event_reminder:'), ('slack', 'slack:event_reminder:'))
          AS c(channel, key_prefix)
        WHERE r.status = 'confirmed'
          AND e.cancelled_at IS NULL
          AND e.starts_at > now()
          AND e.starts_at < now() + interval '24 hours'
          AND r.status_changed_at < e.starts_at - interval '24 hours'
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`);
  // i genuinely hate gh copilto so fming much AHHAHHGHGHHHAHH it keeps trying to write bs into this sql query tspmo SOB
}
