package com.plinthwell.roaamm.admin;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Read-only admin queries. Every one is scoped by is_demo. */
@Repository
public class AdminRepository {

    /** A count now, plus how many rows were created in the last 30 days and the 30 days before. */
    public record Kpi(long value, long last30, long prev30) {}

    public record Overview(Kpi users, Kpi pendingVerifications, Kpi pendingGuideApplications, Kpi trips,
            long tripsPlanned, long tripsOngoing, long tripsCompleted, long tripsCancelled) {}

    public record UserRow(UUID id, String displayName, String role, boolean verified, boolean isDemo,
            boolean isSample, Instant createdAt) {}

    private final JdbcClient jdbc;

    public AdminRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** One round trip: four small aggregate subqueries, each on an (is_demo, ...) index. */
    public Overview overview(boolean isDemo, Instant now) {
        Instant d30 = now.minusSeconds(30L * 86_400);
        Instant d60 = now.minusSeconds(60L * 86_400);
        return jdbc.sql("""
                        SELECT u.total AS u_total, u.last30 AS u_last30, u.prev30 AS u_prev30,
                               v.total AS v_total, v.last30 AS v_last30, v.prev30 AS v_prev30,
                               g.total AS g_total, g.last30 AS g_last30, g.prev30 AS g_prev30,
                               t.total AS t_total, t.last30 AS t_last30, t.prev30 AS t_prev30,
                               t.planned, t.ongoing, t.completed, t.cancelled
                        FROM (SELECT count(*) AS total,
                                     count(*) FILTER (WHERE created_at >= :d30) AS last30,
                                     count(*) FILTER (WHERE created_at >= :d60 AND created_at < :d30) AS prev30
                              FROM users WHERE is_demo = :demo) u,
                             (SELECT count(*) FILTER (WHERE status = 'pending') AS total,
                                     count(*) FILTER (WHERE created_at >= :d30) AS last30,
                                     count(*) FILTER (WHERE created_at >= :d60 AND created_at < :d30) AS prev30
                              FROM verification_requests WHERE is_demo = :demo) v,
                             (SELECT count(*) FILTER (WHERE status IN ('submitted', 'in_review')) AS total,
                                     count(*) FILTER (WHERE created_at >= :d30) AS last30,
                                     count(*) FILTER (WHERE created_at >= :d60 AND created_at < :d30) AS prev30
                              FROM guide_applications WHERE is_demo = :demo) g,
                             (SELECT count(*) AS total,
                                     count(*) FILTER (WHERE created_at >= :d30) AS last30,
                                     count(*) FILTER (WHERE created_at >= :d60 AND created_at < :d30) AS prev30,
                                     count(*) FILTER (WHERE status = 'planned') AS planned,
                                     count(*) FILTER (WHERE status = 'ongoing') AS ongoing,
                                     count(*) FILTER (WHERE status = 'completed') AS completed,
                                     count(*) FILTER (WHERE status = 'cancelled') AS cancelled
                              FROM trips WHERE is_demo = :demo) t""")
                .param("demo", isDemo).param("d30", Timestamp.from(d30)).param("d60", Timestamp.from(d60))
                .query((rs, n) -> new Overview(
                        new Kpi(rs.getLong("u_total"), rs.getLong("u_last30"), rs.getLong("u_prev30")),
                        new Kpi(rs.getLong("v_total"), rs.getLong("v_last30"), rs.getLong("v_prev30")),
                        new Kpi(rs.getLong("g_total"), rs.getLong("g_last30"), rs.getLong("g_prev30")),
                        new Kpi(rs.getLong("t_total"), rs.getLong("t_last30"), rs.getLong("t_prev30")),
                        rs.getLong("planned"), rs.getLong("ongoing"), rs.getLong("completed"),
                        rs.getLong("cancelled")))
                .single();
    }

    /** The filters of the users list. Null means "any". {@code namePattern} is an escaped ILIKE pattern. */
    public record UserFilter(String role, Boolean verified, String namePattern) {}

    private static final String VERIFIED = """
            EXISTS (SELECT 1 FROM verification_requests v WHERE v.user_id = u.id AND v.status = 'verified')""";

    /** {@code sort}: created_desc, created_asc, name_asc or name_desc (already checked). */
    public List<UserRow> users(boolean isDemo, UserFilter f, String sort, int limit, int offset) {
        String order = switch (sort) {
            case "created_asc" -> " ORDER BY u.created_at, u.id";
            case "name_asc" -> " ORDER BY lower(u.display_name), u.id";
            case "name_desc" -> " ORDER BY lower(u.display_name) DESC, u.id";
            default -> " ORDER BY u.created_at DESC, u.id";
        };
        var spec = jdbc.sql("SELECT u.id, u.display_name, u.role::text AS role, u.is_demo, u.is_sample, u.created_at, "
                        + VERIFIED + " AS verified FROM users u" + where(f) + order + " LIMIT :limit OFFSET :offset")
                .param("demo", isDemo).param("limit", limit).param("offset", offset);
        return bind(spec, f)
                .query((rs, n) -> new UserRow(rs.getObject("id", UUID.class), rs.getString("display_name"),
                        rs.getString("role"), rs.getBoolean("verified"), rs.getBoolean("is_demo"),
                        rs.getBoolean("is_sample"), rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    public long countUsers(boolean isDemo, UserFilter f) {
        var spec = jdbc.sql("SELECT count(*) FROM users u" + where(f)).param("demo", isDemo);
        return bind(spec, f).query(Long.class).single();
    }

    private static String where(UserFilter f) {
        StringBuilder sb = new StringBuilder(" WHERE u.is_demo = :demo");
        if (f.role() != null) {
            sb.append(" AND u.role = CAST(:role AS user_role)");
        }
        if (f.verified() != null) {
            sb.append(f.verified() ? " AND " : " AND NOT ").append(VERIFIED);
        }
        if (f.namePattern() != null) {
            sb.append(" AND u.display_name ILIKE :q ESCAPE '\\'");
        }
        return sb.toString();
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec spec, UserFilter f) {
        if (f.role() != null) {
            spec = spec.param("role", f.role());
        }
        if (f.namePattern() != null) {
            spec = spec.param("q", f.namePattern());
        }
        return spec;
    }
}
