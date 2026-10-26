ALTER TABLE events
    ADD COLUMN kind text NOT NULL DEFAULT 'ysws' CHECK (kind IN ('ysws', 'irl')),
    ADD COLUMN timezone text NOT NULL DEFAULT 'UTC',
    ADD COLUMN online_url text,
    ADD COLUMN location_display text,
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN requires_verification boolean NOT NULL DEFAULT false,
    ADD COLUMN slack_channel_id text,
    ADD COLUMN website text;

ALTER TABLE events ALTER COLUMN kind DROP DEFAULT;
