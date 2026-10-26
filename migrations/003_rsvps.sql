CREATE TABLE rsvps (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notifications_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX rsvps_one_live_per_user ON rsvps (event_id, user_id) WHERE status <> 'cancelled';
CREATE INDEX rsvps_event_status_idx ON rsvps (event_id, status);
CREATE INDEX rsvps_user_idx ON rsvps (user_id);
