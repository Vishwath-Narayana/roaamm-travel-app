package com.plinthwell.roaamm.trips;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Trips. Member queries always filter by user_id; admin queries by is_demo. */
@Repository
public class TripRepository {

    public record Trip(UUID id, UUID userId, String ownerDisplayName, String title, String destination,
            LocalDate startDate, LocalDate endDate, String status, String notes, boolean isDemo, boolean isSample,
            Instant createdAt, Instant updatedAt) {}

    public static final List<String> STATUSES = List.of("planned", "ongoing", "completed", "cancelled");

    private static final String SELECT_TRIP = """
            SELECT t.id, t.user_id, u.display_name, t.title, t.destination, t.start_date, t.end_date,
                   t.status::text AS status, t.notes, t.is_demo, t.is_sample, t.created_at, t.updated_at
            FROM trips t JOIN users u ON u.id = t.user_id
            """;

    private final JdbcClient jdbc;

    public TripRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The trip if it belongs to the user, else empty (never reveals another user's trip). */
    public Optional<Trip> findOwned(UUID id, UUID userId) {
        return jdbc.sql(SELECT_TRIP + " WHERE t.id = :id AND t.user_id = :user")
                .param("id", id).param("user", userId).query(TripRepository::trip).optional();
    }

    /** {@code when}: all (newest start first), upcoming (soonest first) or past (most recent first). */
    public List<Trip> listForUser(UUID userId, String when, LocalDate today, int limit, int offset) {
        String filter = switch (when) {
            case "upcoming" -> " AND t.end_date >= :today AND t.status IN ('planned', 'ongoing')"
                    + " ORDER BY t.start_date, t.id";
            case "past" -> " AND (t.end_date < :today OR t.status IN ('completed', 'cancelled'))"
                    + " ORDER BY t.start_date DESC, t.id";
            default -> " ORDER BY t.start_date DESC, t.id";
        };
        var spec = jdbc.sql(SELECT_TRIP + " WHERE t.user_id = :user" + filter + " LIMIT :limit OFFSET :offset")
                .param("user", userId).param("limit", limit).param("offset", offset);
        if (!"all".equals(when)) {
            spec = spec.param("today", Date.valueOf(today));
        }
        return spec.query(TripRepository::trip).list();
    }

    /** Trips per status for one user, plus "total". */
    public Map<String, Long> countsForUser(UUID userId) {
        return jdbc.sql("""
                        SELECT count(*) AS total,
                               count(*) FILTER (WHERE status = 'planned') AS planned,
                               count(*) FILTER (WHERE status = 'ongoing') AS ongoing,
                               count(*) FILTER (WHERE status = 'completed') AS completed,
                               count(*) FILTER (WHERE status = 'cancelled') AS cancelled
                        FROM trips WHERE user_id = :user""")
                .param("user", userId)
                .query((rs, n) -> {
                    Map<String, Long> m = new LinkedHashMap<>();
                    m.put("total", rs.getLong("total"));
                    for (String s : STATUSES) {
                        m.put(s, rs.getLong(s));
                    }
                    return m;
                })
                .single();
    }

    /** Locks the owner's row so two concurrent creates cannot both pass the per-user cap. */
    public int lockAndCount(UUID userId) {
        jdbc.sql("SELECT id FROM users WHERE id = :user FOR UPDATE").param("user", userId).query(UUID.class).single();
        return jdbc.sql("SELECT count(*) FROM trips WHERE user_id = :user")
                .param("user", userId).query(Integer.class).single();
    }

    public void insert(UUID id, UUID userId, TripService.Fields f, boolean isDemo, Instant now) {
        jdbc.sql("""
                        INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, notes,
                                           is_demo, is_sample, created_at, updated_at)
                        VALUES (:id, :user, :title, :dest, :start, :end, CAST(:status AS trip_status), :notes,
                                :demo, false, :now, :now)""")
                .param("id", id).param("user", userId).param("title", f.title()).param("dest", f.destination())
                .param("start", Date.valueOf(f.startDate())).param("end", Date.valueOf(f.endDate()))
                .param("status", f.status()).param("notes", f.notes()).param("demo", isDemo)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Updates the user's own non-sample trip. False when there is no such row. */
    public boolean update(UUID id, UUID userId, TripService.Fields f, Instant now) {
        return jdbc.sql("""
                        UPDATE trips SET title = :title, destination = :dest, start_date = :start, end_date = :end,
                               status = CAST(:status AS trip_status), notes = :notes, updated_at = :now
                        WHERE id = :id AND user_id = :user AND NOT is_sample""")
                .param("title", f.title()).param("dest", f.destination())
                .param("start", Date.valueOf(f.startDate())).param("end", Date.valueOf(f.endDate()))
                .param("status", f.status()).param("notes", f.notes()).param("now", Timestamp.from(now))
                .param("id", id).param("user", userId)
                .update() == 1;
    }

    public boolean delete(UUID id, UUID userId) {
        return jdbc.sql("DELETE FROM trips WHERE id = :id AND user_id = :user AND NOT is_sample")
                .param("id", id).param("user", userId).update() == 1;
    }

    /** Shared demo users: keeps the newest visitor-made trips so the total stays at {@code max}. */
    public int trimDemoUser(UUID userId, int max) {
        return jdbc.sql("""
                        DELETE FROM trips WHERE id IN (
                            SELECT id FROM trips WHERE user_id = :user AND is_demo AND NOT is_sample
                            ORDER BY created_at DESC, id
                            OFFSET GREATEST(0, :max - (SELECT count(*) FROM trips
                                                         WHERE user_id = :user AND is_sample)))""")
                .param("user", userId).param("max", max).update();
    }

    /** Trips made by demo visitors live about a day; the sample trips stay. */
    public int deleteDemoBefore(Instant cutoff) {
        return jdbc.sql("DELETE FROM trips WHERE is_demo AND NOT is_sample AND created_at < :c")
                .param("c", Timestamp.from(cutoff)).update();
    }

    /** Keeps the sample trips' dates relative to today (one past, two upcoming). */
    public void moveSample(UUID id, LocalDate start, LocalDate end) {
        jdbc.sql("UPDATE trips SET start_date = :start, end_date = :end WHERE id = :id AND is_sample")
                .param("start", Date.valueOf(start)).param("end", Date.valueOf(end)).param("id", id).update();
    }

    // ---- admin (read-only, scoped)

    /** {@code sort}: start_desc, start_asc or created_desc (already checked). */
    public List<Trip> listInScope(boolean isDemo, String status, String sort, int limit, int offset) {
        String order = switch (sort) {
            case "start_asc" -> " ORDER BY t.start_date, t.id";
            case "created_desc" -> " ORDER BY t.created_at DESC, t.id";
            default -> " ORDER BY t.start_date DESC, t.id";
        };
        String filter = status == null ? "" : " AND t.status = CAST(:status AS trip_status)";
        var spec = jdbc.sql(SELECT_TRIP + " WHERE t.is_demo = :demo" + filter + order + " LIMIT :limit OFFSET :offset")
                .param("demo", isDemo).param("limit", limit).param("offset", offset);
        if (status != null) {
            spec = spec.param("status", status);
        }
        return spec.query(TripRepository::trip).list();
    }

    public long countInScope(boolean isDemo, String status) {
        String filter = status == null ? "" : " AND status = CAST(:status AS trip_status)";
        var spec = jdbc.sql("SELECT count(*) FROM trips WHERE is_demo = :demo" + filter).param("demo", isDemo);
        if (status != null) {
            spec = spec.param("status", status);
        }
        return spec.query(Long.class).single();
    }

    private static Trip trip(ResultSet rs, int n) throws SQLException {
        return new Trip(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("display_name"), rs.getString("title"), rs.getString("destination"),
                rs.getDate("start_date").toLocalDate(), rs.getDate("end_date").toLocalDate(), rs.getString("status"),
                rs.getString("notes"), rs.getBoolean("is_demo"), rs.getBoolean("is_sample"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant());
    }
}
