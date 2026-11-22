CREATE TABLE custom_domains (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    host text NOT NULL,
    cf_hostname_id text UNIQUE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'failed', 'removed')),
    failure_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    activated_at timestamptz,
    expires_at timestamptz NOT NULL,
    warned_at timestamptz
);

-- Partial, so a removed or failed domain can be added again.
CREATE UNIQUE INDEX custom_domains_live_host_idx
    ON custom_domains (host) WHERE status IN ('pending', 'active');
CREATE UNIQUE INDEX custom_domains_live_event_idx
    ON custom_domains (event_id) WHERE status IN ('pending', 'active');

-- Jobs scan live domains by status and expiry.
CREATE INDEX custom_domains_live_expiry_idx
    ON custom_domains (status, expires_at) WHERE status IN ('pending', 'active');
