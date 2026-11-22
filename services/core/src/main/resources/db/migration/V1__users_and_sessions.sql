CREATE TYPE user_role AS ENUM ('traveller', 'guide', 'admin');

CREATE TABLE users (
    id           uuid        PRIMARY KEY,
    role         user_role   NOT NULL,
    display_name text        NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    is_demo      boolean     NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Only the SHA-256 of a session token is stored; the token itself lives in
-- the browser cookie and nowhere else.
CREATE TABLE sessions (
    id           uuid        PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   bytea       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at   timestamptz NOT NULL,
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_created_idx ON sessions (user_id, created_at DESC);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
