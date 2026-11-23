-- M3: simulated ID verification, admin queue and audit log (docs/adr/0006-simulated-verification.md).
-- No real ID document, number or photo is ever stored: a request holds only a
-- document TYPE and a server-generated sample reference.

-- Real admins exist only through the runbook (docs/runbooks/first-admin.md);
-- signup still refuses the admin role in the API. Relax the M2b shape check so
-- that one documented UPDATE can promote a real user.
ALTER TABLE users DROP CONSTRAINT users_real_user_shape;
ALTER TABLE users ADD CONSTRAINT users_real_user_shape CHECK (
    is_demo OR (user_handle IS NOT NULL AND length(display_name) <= 40)
);

-- Simulated people who appear in the demo admin queue. They cannot sign in
-- (no passkey, not picked by demo login) and exist only in the demo scope.
ALTER TABLE users ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD CONSTRAINT users_sample_is_demo CHECK (NOT is_sample OR is_demo);

CREATE TYPE verification_doc_type AS ENUM ('passport', 'national_id', 'driving_licence');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE verification_requests (
    id          uuid                  PRIMARY KEY,
    user_id     uuid                  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    doc_type    verification_doc_type NOT NULL,
    -- Server-generated, e.g. SAMPLE-7KQ2M9XD. Never anything a user typed.
    sample_ref  text                  NOT NULL CHECK (sample_ref ~ '^SAMPLE-[A-Z0-9]{8}$'),
    status      verification_status   NOT NULL DEFAULT 'pending',
    reason      text                  CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 200),
    created_at  timestamptz           NOT NULL DEFAULT now(),
    decided_at  timestamptz,
    decided_by  uuid,
    -- Copied from the user: the demo admin sees only demo rows, a real admin only real rows.
    is_demo     boolean               NOT NULL,
    -- Fixed simulated rows for the demo queue; the daily demo cleanup keeps them.
    is_seed     boolean               NOT NULL DEFAULT false,
    CHECK ((status = 'pending') = (decided_at IS NULL)),
    CHECK (status <> 'rejected' OR reason IS NOT NULL),
    CHECK (NOT is_seed OR is_demo)
);

-- At most one pending request per real user. Shared demo users are capped in code instead.
CREATE UNIQUE INDEX verification_one_pending_per_real_user
    ON verification_requests (user_id) WHERE status = 'pending' AND NOT is_demo;
CREATE INDEX verification_user_created_idx ON verification_requests (user_id, created_at DESC);
CREATE INDEX verification_scope_status_idx ON verification_requests (is_demo, status, created_at DESC);

-- Append-only. No foreign key on admin_user_id, so deleting an account never
-- rewrites history; target_id is the verification request id.
CREATE TABLE admin_audit_log (
    id            uuid        PRIMARY KEY,
    admin_user_id uuid        NOT NULL,
    action        text        NOT NULL CHECK (action ~ '^[a-z_.]{1,40}$'),
    target_id     uuid        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    is_demo       boolean     NOT NULL
);

CREATE INDEX admin_audit_scope_created_idx ON admin_audit_log (is_demo, created_at DESC);

CREATE FUNCTION reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER admin_audit_log_append_only
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_audit_change();
CREATE TRIGGER admin_audit_log_no_truncate
    BEFORE TRUNCATE ON admin_audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_change();

-- Simulated demo queue (all marked sample/seed; no real people, no real IDs).
INSERT INTO users (id, role, display_name, is_demo, is_sample) VALUES
    ('00000000-0000-4000-8000-000000000101', 'traveller', 'Sample traveller Ana', true, true),
    ('00000000-0000-4000-8000-000000000102', 'guide',     'Sample guide Kofi',    true, true),
    ('00000000-0000-4000-8000-000000000103', 'traveller', 'Sample traveller Mei', true, true),
    ('00000000-0000-4000-8000-000000000104', 'guide',     'Sample guide Lucas',   true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO verification_requests
    (id, user_id, doc_type, sample_ref, status, reason, created_at, decided_at, decided_by, is_demo, is_seed)
VALUES
    ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'passport',
     'SAMPLE-ANA00001', 'pending', NULL, now() - interval '2 hours', NULL, NULL, true, true),
    ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'driving_licence',
     'SAMPLE-KOFI0002', 'pending', NULL, now() - interval '50 minutes', NULL, NULL, true, true),
    ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', 'national_id',
     'SAMPLE-MEI00003', 'verified', NULL, now() - interval '3 days', now() - interval '2 days',
     '00000000-0000-4000-8000-000000000003', true, true),
    ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000104', 'passport',
     'SAMPLE-LUCAS004', 'rejected', 'Sample image was blurred (simulated).', now() - interval '4 days',
     now() - interval '3 days', '00000000-0000-4000-8000-000000000003', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_audit_log (id, admin_user_id, action, target_id, created_at, is_demo) VALUES
    ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000203', now() - interval '2 days', true),
    ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000003', 'verification.reject',
     '00000000-0000-4000-8000-000000000204', now() - interval '3 days', true)
ON CONFLICT (id) DO NOTHING;
