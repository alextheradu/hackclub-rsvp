CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hca_id text NOT NULL UNIQUE,
    email text NOT NULL,
    email_verified boolean,
    name text,
    given_name text,
    family_name text,
    nickname text,
    slack_id text,
    verification_status text,
    ysws_eligible boolean,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_email_idx ON users (email);

CREATE TABLE orgs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
    org_id bigint NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

CREATE INDEX org_members_user_id_idx ON org_members (user_id);

CREATE TABLE events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_id bigint NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
    title text NOT NULL,
    description text,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    location text,
    capacity integer CHECK (capacity IS NULL OR capacity > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX events_org_id_idx ON events (org_id);