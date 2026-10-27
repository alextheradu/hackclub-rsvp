CREATE TABLE outbox (
    id BIGSERIAL PRIMARY KEY,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'slack')),
    kind TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    dedupe_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX outbox_due_idx ON outbox (run_after) WHERE status = 'pending';
CREATE UNIQUE INDEX outbox_dedupe_idx ON outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;
