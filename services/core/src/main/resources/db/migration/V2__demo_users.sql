-- The three shared sandbox accounts behind "Try the demo". Fixed ids, no
-- real data, safe to re-run.
INSERT INTO users (id, role, display_name, is_demo) VALUES
    ('00000000-0000-4000-8000-000000000001', 'traveller', 'Demo traveller', true),
    ('00000000-0000-4000-8000-000000000002', 'guide',     'Demo guide',     true),
    ('00000000-0000-4000-8000-000000000003', 'admin',     'Demo admin',     true)
ON CONFLICT (id) DO NOTHING;
