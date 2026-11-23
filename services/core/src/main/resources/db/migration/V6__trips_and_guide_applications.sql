-- M4a: trips, guide applications and admin console queries
-- (docs/adr/0008-guide-applications.md). Every row carries is_demo, copied
-- from its owner, so demo and real data never mix.

-- ---- trips

CREATE TYPE trip_status AS ENUM ('planned', 'ongoing', 'completed', 'cancelled');

CREATE TABLE trips (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       text        NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    -- City and country as plain text only (checked in the API).
    destination text        NOT NULL CHECK (length(destination) BETWEEN 1 AND 80),
    start_date  date        NOT NULL,
    end_date    date        NOT NULL,
    status      trip_status NOT NULL DEFAULT 'planned',
    notes       text        CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 500),
    is_demo     boolean     NOT NULL,
    -- Fixed simulated rows for the demo traveller; the daily demo cleanup keeps them.
    is_sample   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    CHECK (NOT is_sample OR is_demo)
);

-- A member's own list, newest start first.
CREATE INDEX trips_user_start_idx ON trips (user_id, start_date DESC, id);
-- Admin list and the overview's 30-day counts, per scope.
CREATE INDEX trips_scope_created_idx ON trips (is_demo, created_at DESC, id);
CREATE INDEX trips_scope_status_idx ON trips (is_demo, status);

-- ---- guide applications

CREATE TYPE guide_application_status AS ENUM ('submitted', 'in_review', 'approved', 'rejected');

CREATE TABLE guide_applications (
    id            uuid                     PRIMARY KEY,
    user_id       uuid                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status        guide_application_status NOT NULL DEFAULT 'submitted',
    headline      text                     NOT NULL CHECK (length(headline) BETWEEN 1 AND 80),
    bio           text                     NOT NULL CHECK (length(bio) BETWEEN 1 AND 600),
    -- Codes from a fixed list and city names, both checked in the API.
    languages     text[]                   NOT NULL CHECK (cardinality(languages) BETWEEN 1 AND 5),
    cities        text[]                   NOT NULL CHECK (cardinality(cities) BETWEEN 1 AND 5),
    -- No foreign key, like admin_audit_log: deleting an admin never rewrites history.
    reviewer_id   uuid,
    decision_note text                     CHECK (decision_note IS NULL OR length(decision_note) BETWEEN 1 AND 300),
    created_at    timestamptz              NOT NULL DEFAULT now(),
    reviewed_at   timestamptz,
    decided_at    timestamptz,
    is_demo       boolean                  NOT NULL,
    is_sample     boolean                  NOT NULL DEFAULT false,
    CHECK ((status IN ('approved', 'rejected')) = (decided_at IS NOT NULL)),
    CHECK (status = 'submitted' OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)),
    CHECK (status <> 'rejected' OR decision_note IS NOT NULL),
    CHECK (NOT is_sample OR is_demo)
);

-- At most one open application per real user. Shared demo users are capped in code instead.
CREATE UNIQUE INDEX guide_applications_one_open_per_real_user
    ON guide_applications (user_id) WHERE status IN ('submitted', 'in_review') AND NOT is_demo;
CREATE INDEX guide_applications_user_created_idx ON guide_applications (user_id, created_at DESC);
CREATE INDEX guide_applications_scope_status_idx
    ON guide_applications (is_demo, status, created_at DESC, id);
CREATE INDEX guide_applications_scope_created_idx ON guide_applications (is_demo, created_at DESC);

-- ---- admin console queries

CREATE INDEX users_scope_created_idx ON users (is_demo, created_at DESC, id);
CREATE INDEX verification_scope_created_idx ON verification_requests (is_demo, created_at DESC);
-- "Is this user verified?" for the users list and the guide application check.
CREATE INDEX verification_verified_user_idx ON verification_requests (user_id) WHERE status = 'verified';
-- History of one request or application for the detail timeline.
CREATE INDEX admin_audit_target_idx ON admin_audit_log (target_id, created_at);

-- ---- simulated demo data (fixed ids, idempotent, every row marked sample/seed)

-- The demo traveller is a simulated verified traveller, so the demo can show
-- the guide application flow. The demo guide stays unverified so the
-- verification flow can still be tried.
INSERT INTO verification_requests
    (id, user_id, doc_type, sample_ref, status, reason, created_at, decided_at, decided_by, is_demo, is_seed)
VALUES
    ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000001', 'passport',
     'SAMPLE-DEMOTRV1', 'verified', NULL, now() - interval '30 days', now() - interval '29 days',
     '00000000-0000-4000-8000-000000000003', true, true)
ON CONFLICT (id) DO NOTHING;

-- Five obviously fictional applicants. They cannot sign in (no passkey, not
-- picked by demo login) and exist only in the demo scope.
INSERT INTO users (id, role, display_name, is_demo, is_sample, created_at) VALUES
    ('00000000-0000-4000-8000-000000000111', 'traveller', 'Sample applicant Rook', true, true, now() - interval '20 days'),
    ('00000000-0000-4000-8000-000000000112', 'traveller', 'Sample applicant Wren', true, true, now() - interval '25 days'),
    ('00000000-0000-4000-8000-000000000113', 'traveller', 'Sample applicant Moss', true, true, now() - interval '40 days'),
    ('00000000-0000-4000-8000-000000000114', 'traveller', 'Sample applicant Pip',  true, true, now() - interval '45 days'),
    ('00000000-0000-4000-8000-000000000115', 'traveller', 'Sample applicant Sol',  true, true, now() - interval '8 days')
ON CONFLICT (id) DO NOTHING;

-- Only verified travellers may apply, so each applicant has a simulated verified request.
INSERT INTO verification_requests
    (id, user_id, doc_type, sample_ref, status, reason, created_at, decided_at, decided_by, is_demo, is_seed)
VALUES
    ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000111', 'passport',
     'SAMPLE-ROOK0011', 'verified', NULL, now() - interval '19 days', now() - interval '18 days',
     '00000000-0000-4000-8000-000000000003', true, true),
    ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000112', 'national_id',
     'SAMPLE-WREN0012', 'verified', NULL, now() - interval '24 days', now() - interval '23 days',
     '00000000-0000-4000-8000-000000000003', true, true),
    ('00000000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-000000000113', 'driving_licence',
     'SAMPLE-MOSS0013', 'verified', NULL, now() - interval '39 days', now() - interval '38 days',
     '00000000-0000-4000-8000-000000000003', true, true),
    ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000114', 'passport',
     'SAMPLE-PIP00014', 'verified', NULL, now() - interval '44 days', now() - interval '43 days',
     '00000000-0000-4000-8000-000000000003', true, true),
    ('00000000-0000-4000-8000-000000000215', '00000000-0000-4000-8000-000000000115', 'national_id',
     'SAMPLE-SOL00015', 'verified', NULL, now() - interval '7 days', now() - interval '6 days',
     '00000000-0000-4000-8000-000000000003', true, true)
ON CONFLICT (id) DO NOTHING;

-- One application in each status (two submitted).
INSERT INTO guide_applications
    (id, user_id, status, headline, bio, languages, cities, reviewer_id, decision_note,
     created_at, reviewed_at, decided_at, is_demo, is_sample)
VALUES
    ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000111', 'submitted',
     'Sample: old-town walks and night markets',
     'Simulated applicant. Leads slow walking tours through old quarters and street food markets.',
     ARRAY['en', 'pt'], ARRAY['Lisbon', 'Porto'], NULL, NULL,
     now() - interval '1 day', NULL, NULL, true, true),
    ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000112', 'in_review',
     'Sample: mountain day hikes for first-timers',
     'Simulated applicant. Plans gentle day hikes with plenty of breaks and local snacks on the way.',
     ARRAY['en', 'es'], ARRAY['Cusco'], '00000000-0000-4000-8000-000000000003', NULL,
     now() - interval '3 days', now() - interval '2 days', NULL, true, true),
    ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000113', 'approved',
     'Sample: temple mornings and tea houses',
     'Simulated applicant. Early temple visits before the crowds, then a quiet tea house stop.',
     ARRAY['en', 'ja'], ARRAY['Kyoto', 'Nara'], '00000000-0000-4000-8000-000000000003',
     'Sample: clear plan and strong local knowledge (simulated).',
     now() - interval '10 days', now() - interval '9 days', now() - interval '8 days', true, true),
    ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000114', 'rejected',
     'Sample: city tours',
     'Simulated applicant. Short bio.',
     ARRAY['en'], ARRAY['Berlin'], '00000000-0000-4000-8000-000000000003',
     'Sample: please describe your tours in more detail (simulated).',
     now() - interval '12 days', now() - interval '11 days', now() - interval '10 days', true, true),
    ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000115', 'submitted',
     'Sample: coastal cycling and village cafes',
     'Simulated applicant. Easy coastal rides with stops in small villages for coffee and pastries.',
     ARRAY['en', 'fr', 'it'], ARRAY['Nice', 'Genoa'], NULL, NULL,
     now() - interval '5 hours', NULL, NULL, true, true)
ON CONFLICT (id) DO NOTHING;

-- Audit rows for the simulated decisions above, so the demo timelines are complete.
INSERT INTO admin_audit_log (id, admin_user_id, action, target_id, created_at, is_demo) VALUES
    ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000205', now() - interval '29 days', true),
    ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000211', now() - interval '18 days', true),
    ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000212', now() - interval '23 days', true),
    ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000213', now() - interval '38 days', true),
    ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000214', now() - interval '43 days', true),
    ('00000000-0000-4000-8000-000000000315', '00000000-0000-4000-8000-000000000003', 'verification.approve',
     '00000000-0000-4000-8000-000000000215', now() - interval '6 days', true),
    ('00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000003', 'guide_application.review',
     '00000000-0000-4000-8000-000000000502', now() - interval '2 days', true),
    ('00000000-0000-4000-8000-000000000322', '00000000-0000-4000-8000-000000000003', 'guide_application.review',
     '00000000-0000-4000-8000-000000000503', now() - interval '9 days', true),
    ('00000000-0000-4000-8000-000000000323', '00000000-0000-4000-8000-000000000003', 'guide_application.approve',
     '00000000-0000-4000-8000-000000000503', now() - interval '8 days', true),
    ('00000000-0000-4000-8000-000000000324', '00000000-0000-4000-8000-000000000003', 'guide_application.review',
     '00000000-0000-4000-8000-000000000504', now() - interval '11 days', true),
    ('00000000-0000-4000-8000-000000000325', '00000000-0000-4000-8000-000000000003', 'guide_application.reject',
     '00000000-0000-4000-8000-000000000504', now() - interval '10 days', true)
ON CONFLICT (id) DO NOTHING;

-- Three sample trips for the demo traveller. The core moves their dates every
-- day (SampleTrips) so one stays in the past and two stay upcoming.
INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, notes, is_demo, is_sample, created_at)
VALUES
    ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001',
     'Food weekend by the river', 'Lisbon, Portugal', current_date - 60, current_date - 57, 'completed',
     'Sample trip (simulated).', true, true, now() - interval '90 days'),
    ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001',
     'Temples in autumn', 'Kyoto, Japan', current_date + 21, current_date + 28, 'planned',
     'Sample trip (simulated).', true, true, now() - interval '20 days'),
    ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001',
     'Trekking in the south', 'El Chalten, Argentina', current_date + 95, current_date + 106, 'planned',
     'Sample trip (simulated).', true, true, now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;
