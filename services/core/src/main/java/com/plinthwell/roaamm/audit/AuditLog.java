package com.plinthwell.roaamm.audit;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The append-only admin audit log (ADR 0006, ADR 0008). Rows are only ever
 * inserted; database triggers refuse UPDATE, DELETE and TRUNCATE. Every read
 * is scoped by is_demo.
 */
@Repository
public class AuditLog {

    /**
     * {@code targetType} is verification, guide_application or user (from the
     * action prefix). {@code targetDisplayName} is the person concerned, or
     * null once the row (or the person) is deleted.
     */
    public record Entry(UUID id, String adminDisplayName, String action, String targetType, UUID targetId,
            String targetDisplayName, Instant createdAt) {}

    /** One step in a request's or application's history. */
    public record Event(String action, String adminDisplayName, Instant createdAt) {}

    private final JdbcClient jdbc;

    public AuditLog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void record(UUID adminId, String action, UUID targetId, boolean isDemo, Instant now) {
        jdbc.sql("""
                        INSERT INTO admin_audit_log (id, admin_user_id, action, target_id, created_at, is_demo)
                        VALUES (:id, :admin, :action, :target, :now, :demo)""")
                .param("id", UUID.randomUUID()).param("admin", adminId).param("action", action)
                .param("target", targetId).param("now", Timestamp.from(now)).param("demo", isDemo)
                .update();
    }

    public List<Entry> page(boolean isDemo, int limit, int offset) {
        return jdbc.sql("""
                        SELECT a.id, u.display_name, a.action, a.target_id, a.created_at,
                               COALESCE(vu.display_name, gu.display_name, tu.display_name) AS target_name
                        FROM admin_audit_log a
                        LEFT JOIN users u ON u.id = a.admin_user_id
                        LEFT JOIN verification_requests r
                               ON a.action LIKE 'verification.%' AND r.id = a.target_id AND r.is_demo = a.is_demo
                        LEFT JOIN users vu ON vu.id = r.user_id
                        LEFT JOIN guide_applications g
                               ON a.action LIKE 'guide\\_application.%' AND g.id = a.target_id AND g.is_demo = a.is_demo
                        LEFT JOIN users gu ON gu.id = g.user_id
                        LEFT JOIN users tu ON a.action LIKE 'user.%' AND tu.id = a.target_id AND tu.is_demo = a.is_demo
                        WHERE a.is_demo = :demo
                        ORDER BY a.created_at DESC, (a.action LIKE 'user.%') DESC, a.id
                        LIMIT :limit OFFSET :offset""")
                .param("demo", isDemo).param("limit", limit).param("offset", offset)
                .query((rs, n) -> {
                    String action = rs.getString("action");
                    return new Entry(rs.getObject("id", UUID.class), rs.getString("display_name"), action,
                            targetType(action), rs.getObject("target_id", UUID.class), rs.getString("target_name"),
                            rs.getTimestamp("created_at").toInstant());
                })
                .list();
    }

    /**
     * History of one target, oldest first. {@code personId} (nullable) also
     * pulls in role changes recorded against the person.
     */
    public List<Event> history(UUID targetId, UUID personId, boolean isDemo) {
        return jdbc.sql("""
                        SELECT a.action, u.display_name, a.created_at
                        FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_user_id
                        WHERE a.is_demo = :demo
                          AND (a.target_id = :target OR (a.target_id = :person AND a.action LIKE 'user.%'))
                        -- A role change shares its approval's timestamp; list it after the approval.
                        ORDER BY a.created_at, (a.action LIKE 'user.%'), a.id LIMIT 50""")
                .param("demo", isDemo).param("target", targetId)
                .param("person", personId == null ? targetId : personId)
                .query((rs, n) -> new Event(rs.getString("action"), rs.getString("display_name"),
                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    static String targetType(String action) {
        int dot = action.indexOf('.');
        return dot < 0 ? action : action.substring(0, dot);
    }
}
