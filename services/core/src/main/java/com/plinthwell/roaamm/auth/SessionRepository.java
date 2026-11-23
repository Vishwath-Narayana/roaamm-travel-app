package com.plinthwell.roaamm.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Plain SQL through JdbcClient; row mapping by hand so the native image needs no reflection. */
@Repository
public class SessionRepository {

    private final JdbcClient jdbc;

    public SessionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<User> findDemoUser(Role role) {
        return jdbc.sql("""
                        SELECT id, role::text AS role, display_name, is_demo
                        FROM users WHERE is_demo AND NOT is_sample AND role = CAST(:role AS user_role)
                        ORDER BY created_at LIMIT 1""")
                .param("role", role.wire())
                .query((rs, n) -> new User(
                        rs.getObject("id", UUID.class),
                        Role.fromWire(rs.getString("role")).orElseThrow(),
                        rs.getString("display_name"),
                        rs.getBoolean("is_demo")))
                .optional();
    }

    public void insert(UUID id, UUID userId, byte[] tokenHash, Instant now, Instant expiresAt) {
        insert(id, userId, tokenHash, now, expiresAt, false, null);
    }

    public void insert(UUID id, UUID userId, byte[] tokenHash, Instant now, Instant expiresAt, boolean viaRecovery,
            Instant freshAuthAt) {
        jdbc.sql("""
                        INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at,
                                              via_recovery, fresh_auth_at)
                        VALUES (:id, :user, :hash, :now, :exp, :now, :recovery, :fresh)""")
                .param("id", id)
                .param("user", userId)
                .param("hash", tokenHash)
                .param("now", Timestamp.from(now))
                .param("exp", Timestamp.from(expiresAt))
                .param("recovery", viaRecovery)
                .param("fresh", freshAuthAt == null ? null : Timestamp.from(freshAuthAt))
                .update();
    }

    /** The live session and its user, touching last_seen_at; empty when unknown or expired. */
    public Optional<SessionService.Current> findSessionByTokenHash(byte[] tokenHash, Instant now) {
        return jdbc.sql("""
                        UPDATE sessions s SET last_seen_at = :now
                        FROM users u
                        WHERE s.token_hash = :hash AND s.expires_at > :now AND u.id = s.user_id
                        RETURNING s.id AS session_id, s.via_recovery, s.fresh_auth_at,
                                  u.id, u.role::text AS role, u.display_name, u.is_demo""")
                .param("hash", tokenHash)
                .param("now", Timestamp.from(now))
                .query((rs, n) -> {
                    Timestamp fresh = rs.getTimestamp("fresh_auth_at");
                    return new SessionService.Current(
                            rs.getObject("session_id", UUID.class),
                            new User(rs.getObject("id", UUID.class),
                                    Role.fromWire(rs.getString("role")).orElseThrow(),
                                    rs.getString("display_name"),
                                    rs.getBoolean("is_demo")),
                            rs.getBoolean("via_recovery"),
                            fresh == null ? null : fresh.toInstant());
                })
                .optional();
    }

    public void markFresh(UUID sessionId, Instant now) {
        jdbc.sql("UPDATE sessions SET fresh_auth_at = :now WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", sessionId).update();
    }

    public void clearRecoveryFlag(UUID sessionId) {
        jdbc.sql("UPDATE sessions SET via_recovery = false WHERE id = :id").param("id", sessionId).update();
    }

    /** The live session's user, touching last_seen_at; empty when unknown or expired. */
    public Optional<User> findUserByTokenHash(byte[] tokenHash, Instant now) {
        return jdbc.sql("""
                        UPDATE sessions s SET last_seen_at = :now
                        FROM users u
                        WHERE s.token_hash = :hash AND s.expires_at > :now AND u.id = s.user_id
                        RETURNING u.id, u.role::text AS role, u.display_name, u.is_demo""")
                .param("hash", tokenHash)
                .param("now", Timestamp.from(now))
                .query((rs, n) -> new User(
                        rs.getObject("id", UUID.class),
                        Role.fromWire(rs.getString("role")).orElseThrow(),
                        rs.getString("display_name"),
                        rs.getBoolean("is_demo")))
                .optional();
    }

    public int deleteByTokenHash(byte[] tokenHash) {
        return jdbc.sql("DELETE FROM sessions WHERE token_hash = :hash").param("hash", tokenHash).update();
    }

    /** Keeps only the newest {@code keep} sessions of a user. */
    public int trimForUser(UUID userId, int keep) {
        return jdbc.sql("""
                        DELETE FROM sessions WHERE id IN (
                            SELECT id FROM sessions WHERE user_id = :user
                            ORDER BY created_at DESC OFFSET :keep)""")
                .param("user", userId)
                .param("keep", keep)
                .update();
    }

    public int deleteExpired(Instant now) {
        return jdbc.sql("DELETE FROM sessions WHERE expires_at <= :now").param("now", Timestamp.from(now)).update();
    }

    public int countForUser(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM sessions WHERE user_id = :user")
                .param("user", userId)
                .query(Integer.class)
                .single();
    }
}
