import { getPool } from "@/lib/db";

export async function queueReminders(): Promise<number> {
    const { rowCount } = await getPool().query(
       `INSERT INTO outbox (channel, kind, payload, dedupe_key)
        SELECT 'email', 'event_reminder', json_build_object('rsvpId', r.id), 'event_reminder:' || r.id
        FROM rsvps r
        JOIN events e ON e.id = r.event_id
        WHERE r.status = 'confirmed'
          AND e.cancelled_at IS NULL
          AND e.starts_at > now()
          AND e.starts_at < now() + interval '24 hours'
          AND r.status_changed_at < e.starts_at - interval '24 hours'
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    );
    // i genuinely hate gh copilto so fming much AHHAHHGHGHHHAHH it keeps trying to write bs into this sql query tspmo SOB
    return rowCount ?? 0;
}