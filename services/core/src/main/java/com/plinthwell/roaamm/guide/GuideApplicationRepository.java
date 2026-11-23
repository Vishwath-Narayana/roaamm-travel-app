package com.plinthwell.roaamm.guide;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Guide applications (ADR 0008). Member queries filter by user_id; admin
 * queries by is_demo. Arrays travel as '|'-joined text (no driver array
 * types, which keeps the native image simple); '|' can never be in a value.
 */
@Repository
public class GuideApplicationRepository {

    public record Application(UUID id, UUID userId, String applicantDisplayName, String applicantRole,
            boolean applicantVerified, String status, String headline, String bio, List<String> languages,
            List<String> cities, String reviewerDisplayName, String decisionNote, Instant createdAt,
            Instant reviewedAt, Instant decidedAt, boolean isDemo, boolean isSample) {}

    public static final List<String> STATUSES = List.of("submitted", "in_review", "approved", "rejected");

    private static final String SELECT_APPLICATION = """
            SELECT g.id, g.user_id, u.display_name, u.role::text AS user_role,
                   EXISTS (SELECT 1 FROM verification_requests v
                           WHERE v.user_id = g.user_id AND v.status = 'verified') AS verified,
                   g.status::text AS status, g.headline, g.bio,
                   array_to_string(g.languages, '|') AS languages, array_to_string(g.cities, '|') AS cities,
                   r.display_name AS reviewer_name, g.decision_note, g.created_at, g.reviewed_at, g.decided_at,
                   g.is_demo, g.is_sample
            FROM guide_applications g
            JOIN users u ON u.id = g.user_id
            LEFT JOIN users r ON r.id = g.reviewer_id
            """;

    private final JdbcClient jdbc;

    public GuideApplicationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Application> latestFor(UUID userId) {
        return jdbc.sql(SELECT_APPLICATION + " WHERE g.user_id = :user ORDER BY g.created_at DESC, g.id LIMIT 1")
                .param("user", userId).query(GuideApplicationRepository::application).optional();
    }

    public boolean hasOpen(UUID userId) {
        return jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM guide_applications
                                       WHERE user_id = :user AND status IN ('submitted', 'in_review'))""")
                .param("user", userId).query(Boolean.class).single();
    }

    public void insert(UUID id, UUID userId, GuideApplicationService.Fields f, boolean isDemo, Instant now) {
        jdbc.sql("""
                        INSERT INTO guide_applications (id, user_id, status, headline, bio, languages, cities,
                                                        created_at, is_demo)
                        VALUES (:id, :user, 'submitted', :headline, :bio, string_to_array(:langs, '|'),
                                string_to_array(:cities, '|'), :now, :demo)""")
                .param("id", id).param("user", userId).param("headline", f.headline()).param("bio", f.bio())
                .param("langs", String.join("|", f.languages())).param("cities", String.join("|", f.cities()))
                .param("now", Timestamp.from(now)).param("demo", isDemo)
                .update();
    }

    /** Shared demo users: keeps the newest {@code keep} visitor-made applications. */
    public int trimDemoUser(UUID userId, int keep) {
        return jdbc.sql("""
                        DELETE FROM guide_applications WHERE id IN (
                            SELECT id FROM guide_applications
                            WHERE user_id = :user AND is_demo AND NOT is_sample
                            ORDER BY created_at DESC, id OFFSET :keep)""")
                .param("user", userId).param("keep", keep).update();
    }

    // ---- admin (scoped)

    /** {@code status} null means every status. */
    public List<Application> list(boolean isDemo, String status, int limit, int offset) {
        String filter = status == null ? "" : " AND g.status = CAST(:status AS guide_application_status)";
        var spec = jdbc.sql(SELECT_APPLICATION + " WHERE g.is_demo = :demo" + filter
                        + " ORDER BY g.created_at DESC, g.id LIMIT :limit OFFSET :offset")
                .param("demo", isDemo).param("limit", limit).param("offset", offset);
        if (status != null) {
            spec = spec.param("status", status);
        }
        return spec.query(GuideApplicationRepository::application).list();
    }

    /** Applications per status in one scope, plus "total". */
    public Map<String, Long> countsByStatus(boolean isDemo) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String s : STATUSES) {
            counts.put(s, 0L);
        }
        jdbc.sql("""
                        SELECT status::text AS status, count(*) AS n FROM guide_applications
                        WHERE is_demo = :demo GROUP BY status""")
                .param("demo", isDemo)
                .query((rs, n) -> Map.entry(rs.getString("status"), rs.getLong("n")))
                .list().forEach(e -> counts.put(e.getKey(), e.getValue()));
        counts.put("total", counts.values().stream().mapToLong(Long::longValue).sum());
        return counts;
    }

    public Optional<Application> findInScope(UUID id, boolean isDemo) {
        return jdbc.sql(SELECT_APPLICATION + " WHERE g.id = :id AND g.is_demo = :demo")
                .param("id", id).param("demo", isDemo).query(GuideApplicationRepository::application).optional();
    }

    /** submitted -> in_review. False if it was no longer submitted. */
    public boolean markInReview(UUID id, boolean isDemo, UUID adminId, Instant now) {
        return jdbc.sql("""
                        UPDATE guide_applications
                        SET status = 'in_review', reviewer_id = :admin, reviewed_at = :now
                        WHERE id = :id AND is_demo = :demo AND status = 'submitted'""")
                .param("admin", adminId).param("now", Timestamp.from(now)).param("id", id).param("demo", isDemo)
                .update() == 1;
    }

    /** Decides an open application (submitted or in review). False if it was already decided. */
    public boolean decide(UUID id, boolean isDemo, String status, String note, UUID adminId, Instant now) {
        return jdbc.sql("""
                        UPDATE guide_applications
                        SET status = CAST(:status AS guide_application_status), decision_note = :note,
                            reviewer_id = :admin, reviewed_at = COALESCE(reviewed_at, :now), decided_at = :now
                        WHERE id = :id AND is_demo = :demo AND status IN ('submitted', 'in_review')""")
                .param("status", status).param("note", note).param("admin", adminId)
                .param("now", Timestamp.from(now)).param("id", id).param("demo", isDemo)
                .update() == 1;
    }

    /**
     * A real traveller becomes a guide. Demo and sample users are never
     * changed: the WHERE clause refuses them even if a caller asked.
     */
    public boolean promoteToGuide(UUID userId) {
        return jdbc.sql("UPDATE users SET role = 'guide' WHERE id = :id AND NOT is_demo AND role = 'traveller'")
                .param("id", userId).update() == 1;
    }

    /** Applications made by demo visitors live about a day; the sample rows stay. */
    public int deleteDemoBefore(Instant cutoff) {
        return jdbc.sql("DELETE FROM guide_applications WHERE is_demo AND NOT is_sample AND created_at < :c")
                .param("c", Timestamp.from(cutoff)).update();
    }

    private static Application application(ResultSet rs, int n) throws SQLException {
        return new Application(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("display_name"), rs.getString("user_role"), rs.getBoolean("verified"),
                rs.getString("status"), rs.getString("headline"), rs.getString("bio"),
                split(rs.getString("languages")), split(rs.getString("cities")), rs.getString("reviewer_name"),
                rs.getString("decision_note"), instant(rs, "created_at"), instant(rs, "reviewed_at"),
                instant(rs, "decided_at"), rs.getBoolean("is_demo"), rs.getBoolean("is_sample"));
    }

    private static List<String> split(String joined) {
        return joined == null || joined.isEmpty() ? List.of() : Arrays.asList(joined.split("\\|"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
