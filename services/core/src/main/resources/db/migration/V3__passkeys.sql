-- M2b: real accounts with passkeys (docs/adr/0005-passkeys.md).
-- Stored per real user: display name, role, a random 64-byte user handle and
-- passkey credentials. No email, phone or IP address.

ALTER TABLE users
    ADD COLUMN user_handle bytea UNIQUE CHECK (user_handle IS NULL OR octet_length(user_handle) = 64),
    ADD COLUMN last_active_at timestamptz NOT NULL DEFAULT now();

-- Real (non-demo) users are travellers or guides, never admins, and always have a handle.
ALTER TABLE users ADD CONSTRAINT users_real_user_shape CHECK (
    is_demo OR (role IN ('traveller', 'guide') AND user_handle IS NOT NULL AND length(display_name) <= 40)
);

CREATE INDEX users_real_last_active_idx ON users (last_active_at) WHERE NOT is_demo;

CREATE TABLE webauthn_credentials (
    id              bytea       PRIMARY KEY CHECK (octet_length(id) BETWEEN 16 AND 1023),
    user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    aaguid          bytea       NOT NULL CHECK (octet_length(aaguid) = 16),
    -- COSE_Key bytes from the authenticator.
    public_key      bytea       NOT NULL CHECK (octet_length(public_key) BETWEEN 1 AND 2048),
    sign_count      bigint      NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
    transports      text        NOT NULL DEFAULT '' CHECK (length(transports) <= 200),
    backup_eligible boolean     NOT NULL,
    backup_state    boolean     NOT NULL,
    label           text        CHECK (label IS NULL OR length(label) BETWEEN 1 AND 40),
    created_at      timestamptz NOT NULL,
    last_used_at    timestamptz
);

CREATE INDEX webauthn_credentials_user_idx ON webauthn_credentials (user_id);

-- Single use: a row is deleted when its challenge is checked, pass or fail.
CREATE TABLE webauthn_challenges (
    id                  uuid        PRIMARY KEY,
    challenge           bytea       NOT NULL CHECK (octet_length(challenge) = 32),
    purpose             text        NOT NULL CHECK (purpose IN ('register', 'login', 'add', 'reauth')),
    -- add / reauth: only the session that asked may answer.
    session_id          uuid        REFERENCES sessions (id) ON DELETE CASCADE,
    -- register: the account to create once the passkey is verified.
    pending_display_name text,
    pending_role        user_role,
    pending_user_handle bytea,
    created_at          timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL
);

CREATE INDEX webauthn_challenges_expires_idx ON webauthn_challenges (expires_at);

-- Only SHA-256 hashes; a code is shown once and works once.
CREATE TABLE recovery_codes (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  bytea       NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
    created_at timestamptz NOT NULL,
    used_at    timestamptz
);

CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

ALTER TABLE sessions
    -- Signed in with a recovery code: the web makes the user add a passkey.
    ADD COLUMN via_recovery boolean NOT NULL DEFAULT false,
    -- Last passkey check in this session; deletes and code regeneration need a recent one.
    ADD COLUMN fresh_auth_at timestamptz;
