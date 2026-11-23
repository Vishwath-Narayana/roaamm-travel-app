-- Defence in depth (ADR 0005): the shared demo accounts can never hold a
-- passkey or a recovery code, whatever the application code does.

CREATE FUNCTION reject_demo_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND is_demo) THEN
        RAISE EXCEPTION 'demo users cannot hold passkeys or recovery codes'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER webauthn_credentials_not_demo
    BEFORE INSERT OR UPDATE OF user_id ON webauthn_credentials
    FOR EACH ROW EXECUTE FUNCTION reject_demo_owner();

CREATE TRIGGER recovery_codes_not_demo
    BEFORE INSERT OR UPDATE OF user_id ON recovery_codes
    FOR EACH ROW EXECUTE FUNCTION reject_demo_owner();
