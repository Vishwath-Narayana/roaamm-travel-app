package com.plinthwell.roaamm.passkey;

import com.plinthwell.roaamm.auth.Role;
import com.plinthwell.roaamm.auth.User;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Real accounts: users, passkeys, challenges and recovery codes. Plain SQL, mapped by hand. */
@Repository
public class AccountRepository {

    /** A consumed challenge. Register challenges carry the account to create. */
    public record Challenge(byte[] challenge, String purpose, UUID sessionId, String pendingDisplayName,
            Role pendingRole, byte[] pendingUserHandle) {}

    /** A stored passkey and the real user it belongs to. */
    public record CredentialOwner(PasskeyVerifier.StoredCredential credential, User user, byte[] userHandle) {}

    /** A passkey as shown on the account page. */
    public record CredentialSummary(byte[] id, String label, Instant createdAt, Instant lastUsedAt,
            boolean backedUp, String transports) {}

    private final JdbcClient jdbc;

    public AccountRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---- challenges

    public void insertChallenge(UUID id, byte[] challenge, String purpose, UUID sessionId, String displayName,
            Role role, byte[] userHandle, Instant now, Instant expiresAt) {
        jdbc.sql("""
                        INSERT INTO webauthn_challenges (id, challenge, purpose, session_id, pending_display_name,
                            pending_role, pending_user_handle, created_at, expires_at)
                        VALUES (:id, :c, :p, :s, :n, CAST(:r AS user_role), :h, :now, :exp)""")
                .param("id", id).param("c", challenge).param("p", purpose).param("s", sessionId)
                .param("n", displayName).param("r", role == null ? null : role.wire()).param("h", userHandle)
                .param("now", Timestamp.from(now)).param("exp", Timestamp.from(expiresAt))
                .update();
    }

    /** Deletes the challenge and returns it if it was live and for this purpose. Single use either way. */
    public Optional<Challenge> consumeChallenge(UUID id, String purpose, Instant now) {
        return jdbc.sql("""
                        DELETE FROM webauthn_challenges WHERE id = :id
                        RETURNING challenge, purpose, session_id, pending_display_name,
                                  pending_role::text AS pending_role, pending_user_handle, expires_at""")
                .param("id", id)
                .query((rs, n) -> rs.getTimestamp("expires_at").toInstant().isAfter(now)
                                && purpose.equals(rs.getString("purpose"))
                        ? new Challenge(rs.getBytes("challenge"), rs.getString("purpose"),
                                rs.getObject("session_id", UUID.class), rs.getString("pending_display_name"),
                                rs.getString("pending_role") == null ? null
                                        : Role.fromWire(rs.getString("pending_role")).orElse(null),
                                rs.getBytes("pending_user_handle"))
                        : null)
                .optional()
                .filter(c -> c != null);
    }

    public int deleteExpiredChallenges(Instant now) {
        return jdbc.sql("DELETE FROM webauthn_challenges WHERE expires_at <= :now")
                .param("now", Timestamp.from(now)).update();
    }

    // ---- users

    public int countRealUsers() {
        return jdbc.sql("SELECT count(*) FROM users WHERE NOT is_demo").query(Integer.class).single();
    }

    public User insertRealUser(UUID id, Role role, String displayName, byte[] userHandle, Instant now) {
        jdbc.sql("""
                        INSERT INTO users (id, role, display_name, is_demo, user_handle, created_at, last_active_at)
                        VALUES (:id, CAST(:role AS user_role), :name, false, :handle, :now, :now)""")
                .param("id", id).param("role", role.wire()).param("name", displayName).param("handle", userHandle)
                .param("now", Timestamp.from(now))
                .update();
        return new User(id, role, displayName, false);
    }

    public Optional<byte[]> userHandle(UUID userId) {
        return jdbc.sql("SELECT user_handle FROM users WHERE id = :id AND NOT is_demo")
                .param("id", userId).query(byte[].class).optional();
    }

    public void touchActive(UUID userId, Instant now) {
        jdbc.sql("UPDATE users SET last_active_at = :now WHERE id = :id AND NOT is_demo")
                .param("now", Timestamp.from(now)).param("id", userId).update();
    }

    /** Deletes real accounts idle since {@code cutoff}. Demo users are never touched. */
    public int deleteInactiveRealUsers(Instant cutoff) {
        return jdbc.sql("DELETE FROM users WHERE NOT is_demo AND last_active_at < :cutoff")
                .param("cutoff", Timestamp.from(cutoff)).update();
    }

    // ---- credentials

    public void insertCredential(UUID userId, PasskeyVerifier.NewCredential c, String label, Instant now) {
        jdbc.sql("""
                        INSERT INTO webauthn_credentials (id, user_id, aaguid, public_key, sign_count, transports,
                            backup_eligible, backup_state, label, created_at)
                        VALUES (:id, :user, :aaguid, :pk, :count, :tr, :be, :bs, :label, :now)""")
                .param("id", c.id()).param("user", userId).param("aaguid", c.aaguid())
                .param("pk", c.publicKeyCose()).param("count", c.signCount()).param("tr", c.transports())
                .param("be", c.backupEligible()).param("bs", c.backupState()).param("label", label)
                .param("now", Timestamp.from(now))
                .update();
    }

    public boolean credentialExists(byte[] id) {
        return jdbc.sql("SELECT count(*) FROM webauthn_credentials WHERE id = :id")
                .param("id", id).query(Integer.class).single() > 0;
    }

    public Optional<CredentialOwner> findCredential(byte[] id) {
        return jdbc.sql("""
                        SELECT c.id, c.aaguid, c.public_key, c.sign_count, c.transports, c.backup_eligible,
                               c.backup_state, u.id AS user_id, u.role::text AS role, u.display_name,
                               u.user_handle
                        FROM webauthn_credentials c JOIN users u ON u.id = c.user_id
                        WHERE c.id = :id AND NOT u.is_demo""")
                .param("id", id)
                .query((rs, n) -> new CredentialOwner(stored(rs),
                        new User(rs.getObject("user_id", UUID.class),
                                Role.fromWire(rs.getString("role")).orElseThrow(),
                                rs.getString("display_name"), false),
                        rs.getBytes("user_handle")))
                .optional();
    }

    public void recordUse(byte[] id, long signCount, boolean backupState, Instant now) {
        jdbc.sql("""
                        UPDATE webauthn_credentials
                        SET sign_count = GREATEST(sign_count, :count), backup_state = :bs, last_used_at = :now
                        WHERE id = :id""")
                .param("count", signCount).param("bs", backupState).param("now", Timestamp.from(now))
                .param("id", id)
                .update();
    }

    public List<CredentialSummary> listCredentials(UUID userId) {
        return jdbc.sql("""
                        SELECT id, label, created_at, last_used_at, backup_state, transports
                        FROM webauthn_credentials WHERE user_id = :user ORDER BY created_at""")
                .param("user", userId)
                .query((rs, n) -> new CredentialSummary(rs.getBytes("id"), rs.getString("label"),
                        rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("last_used_at") == null ? null : rs.getTimestamp("last_used_at").toInstant(),
                        rs.getBoolean("backup_state"), rs.getString("transports")))
                .list();
    }

    public List<byte[]> credentialIds(UUID userId) {
        return jdbc.sql("SELECT id FROM webauthn_credentials WHERE user_id = :user")
                .param("user", userId).query(byte[].class).list();
    }

    public int countCredentials(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM webauthn_credentials WHERE user_id = :user")
                .param("user", userId).query(Integer.class).single();
    }

    public int deleteCredential(UUID userId, byte[] id) {
        return jdbc.sql("DELETE FROM webauthn_credentials WHERE user_id = :user AND id = :id")
                .param("user", userId).param("id", id).update();
    }

    // ---- recovery codes

    public void replaceRecoveryCodes(UUID userId, List<byte[]> hashes, Instant now) {
        jdbc.sql("DELETE FROM recovery_codes WHERE user_id = :user").param("user", userId).update();
        for (byte[] h : hashes) {
            jdbc.sql("""
                            INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
                            VALUES (:id, :user, :hash, :now)""")
                    .param("id", UUID.randomUUID()).param("user", userId).param("hash", h)
                    .param("now", Timestamp.from(now))
                    .update();
        }
    }

    /** Marks the code used and returns its real user, if it was unused. */
    public Optional<User> useRecoveryCode(byte[] hash, Instant now) {
        return jdbc.sql("""
                        UPDATE recovery_codes r SET used_at = :now
                        FROM users u
                        WHERE r.code_hash = :hash AND r.used_at IS NULL AND u.id = r.user_id AND NOT u.is_demo
                        RETURNING u.id, u.role::text AS role, u.display_name""")
                .param("now", Timestamp.from(now)).param("hash", hash)
                .query((rs, n) -> new User(rs.getObject("id", UUID.class),
                        Role.fromWire(rs.getString("role")).orElseThrow(), rs.getString("display_name"), false))
                .optional();
    }

    public int countUnusedRecoveryCodes(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM recovery_codes WHERE user_id = :user AND used_at IS NULL")
                .param("user", userId).query(Integer.class).single();
    }

    private static PasskeyVerifier.StoredCredential stored(ResultSet rs) throws SQLException {
        return new PasskeyVerifier.StoredCredential(rs.getBytes("id"), rs.getBytes("aaguid"),
                rs.getBytes("public_key"), rs.getLong("sign_count"), rs.getString("transports"),
                rs.getBoolean("backup_eligible"), rs.getBoolean("backup_state"));
    }
}
