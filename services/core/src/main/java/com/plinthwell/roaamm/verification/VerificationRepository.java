package com.plinthwell.roaamm.verification;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Verification requests. Every admin query is scoped by is_demo; the audit log is in AuditLog. */
@Repository
public class VerificationRepository {

    public record Request(UUID id, UUID userId, String userDisplayName, String userRole, String docType,
            String sampleRef, String status, String reason, Instant createdAt, Instant decidedAt,
            String decidedByName, boolean isDemo) {}

    private static final String SELECT_REQUEST = """
            SELECT r.id, r.user_id, u.display_name, u.role::text AS user_role, r.doc_type::text AS doc_type,
                   r.sample_ref, r.status::text AS status, r.reason, r.created_at, r.decided_at,
                   d.display_name AS decided_by_name, r.is_demo
            FROM verification_requests r
            JOIN users u ON u.id = r.user_id
            LEFT JOIN users d ON d.id = r.decided_by
            """;

    private final JdbcClient jdbc;

    public VerificationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Request> latestFor(UUID userId) {
        return jdbc.sql(SELECT_REQUEST + " WHERE r.user_id = :user ORDER BY r.created_at DESC, r.id LIMIT 1")
                .param("user", userId).query(VerificationRepository::request).optional();
    }

    public void insert(UUID id, UUID userId, String docType, String sampleRef, boolean isDemo, Instant now) {
        jdbc.sql("""
                        INSERT INTO verification_requests (id, user_id, doc_type, sample_ref, status, created_at, is_demo)
                        VALUES (:id, :user, CAST(:doc AS verification_doc_type), :ref, 'pending', :now, :demo)""")
                .param("id", id).param("user", userId).param("doc", docType).param("ref", sampleRef)
                .param("demo", isDemo).param("now", Timestamp.from(now))
                .update();
    }

    /** Keeps the newest {@code keep} visitor-made requests of a shared demo user. */
    public int trimDemoUser(UUID userId, int keep) {
        return jdbc.sql("""
                        DELETE FROM verification_requests WHERE id IN (
                            SELECT id FROM verification_requests
                            WHERE user_id = :user AND is_demo AND NOT is_seed
                            ORDER BY created_at DESC OFFSET :keep)""")
                .param("user", userId).param("keep", keep).update();
    }

    /** {@code namePattern} is an escaped ILIKE pattern, or null for no search. */
    public List<Request> list(boolean isDemo, String status, String namePattern, int limit, int offset) {
        String search = namePattern == null ? "" : " AND u.display_name ILIKE :q ESCAPE '\\'";
        var spec = jdbc.sql(SELECT_REQUEST + """
                         WHERE r.is_demo = :demo AND r.status = CAST(:status AS verification_status)""" + search + """
                         ORDER BY r.created_at DESC, r.id LIMIT :limit OFFSET :offset""")
                .param("demo", isDemo).param("status", status).param("limit", limit).param("offset", offset);
        if (namePattern != null) {
            spec = spec.param("q", namePattern);
        }
        return spec.query(VerificationRepository::request).list();
    }

    /** Requests per status in one scope, for the admin tabs. */
    public Map<String, Long> countsByStatus(boolean isDemo) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String s : List.of("pending", "verified", "rejected")) {
            counts.put(s, 0L);
        }
        jdbc.sql("""
                        SELECT status::text AS status, count(*) AS n FROM verification_requests
                        WHERE is_demo = :demo GROUP BY status""")
                .param("demo", isDemo)
                .query((rs, n) -> Map.entry(rs.getString("status"), rs.getLong("n")))
                .list().forEach(e -> counts.put(e.getKey(), e.getValue()));
        return counts;
    }

    /** True once any request of the user was approved. Verified is final. */
    public boolean isVerified(UUID userId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM verification_requests WHERE user_id = :u AND status = 'verified')")
                .param("u", userId).query(Boolean.class).single();
    }

    public Optional<Request> findInScope(UUID id, boolean isDemo) {
        return jdbc.sql(SELECT_REQUEST + " WHERE r.id = :id AND r.is_demo = :demo")
                .param("id", id).param("demo", isDemo).query(VerificationRepository::request).optional();
    }

    /** Decides a pending request in scope. Returns false if it was no longer pending. */
    public boolean decide(UUID id, boolean isDemo, String status, String reason, UUID adminId, Instant now) {
        return jdbc.sql("""
                        UPDATE verification_requests
                        SET status = CAST(:status AS verification_status), reason = :reason, decided_at = :now,
                            decided_by = :admin
                        WHERE id = :id AND is_demo = :demo AND status = 'pending'""")
                .param("status", status).param("reason", reason).param("now", Timestamp.from(now))
                .param("admin", adminId).param("id", id).param("demo", isDemo)
                .update() == 1;
    }

    /** Rejected requests are kept for a while so the user can see why, then deleted. */
    public int deleteRejectedBefore(Instant cutoff) {
        return jdbc.sql("DELETE FROM verification_requests WHERE status = 'rejected' AND NOT is_seed AND decided_at < :c")
                .param("c", Timestamp.from(cutoff)).update();
    }

    /** Requests made by demo visitors live about a day; the fixed simulated seed rows stay. */
    public int deleteDemoBefore(Instant cutoff) {
        return jdbc.sql("DELETE FROM verification_requests WHERE is_demo AND NOT is_seed AND created_at < :c")
                .param("c", Timestamp.from(cutoff)).update();
    }

    private static Request request(ResultSet rs, int n) throws SQLException {
        Timestamp decided = rs.getTimestamp("decided_at");
        return new Request(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("display_name"), rs.getString("user_role"), rs.getString("doc_type"),
                rs.getString("sample_ref"), rs.getString("status"), rs.getString("reason"),
                rs.getTimestamp("created_at").toInstant(), decided == null ? null : decided.toInstant(),
                rs.getString("decided_by_name"), rs.getBoolean("is_demo"));
    }
}
