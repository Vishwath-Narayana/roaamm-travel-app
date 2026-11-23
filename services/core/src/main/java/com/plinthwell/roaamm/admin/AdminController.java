package com.plinthwell.roaamm.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.plinthwell.roaamm.auth.Access;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.auth.User;
import com.plinthwell.roaamm.common.Page;
import com.plinthwell.roaamm.common.PlainText;
import com.plinthwell.roaamm.passkey.PasskeyException;
import com.plinthwell.roaamm.trips.TripRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only admin console data (M4a): the overview, users and trips. Scoped
 * like every admin endpoint: the demo admin sees demo rows, a real admin real
 * rows. Guide applications and verification have their own controllers.
 */
@RestController
@RegisterReflectionForBinding({
    AdminController.OverviewView.class, AdminController.KpiView.class, AdminController.UserView.class,
    AdminController.UserListView.class, AdminController.TripView.class, AdminController.TripListView.class
})
public class AdminController {

    /**
     * {@code value} is the count now. {@code change} is the percent change of
     * new rows in the last 30 days against the 30 days before, or null when
     * the earlier period had none (no division by zero, no made-up trend).
     */
    public record KpiView(long value, long last30, long prev30, Double change) {
        static KpiView of(AdminRepository.Kpi k) {
            Double change = k.prev30() > 0
                    ? Math.round((k.last30() - k.prev30()) * 1000.0 / k.prev30()) / 10.0
                    : null;
            return new KpiView(k.value(), k.last30(), k.prev30(), change);
        }
    }

    public record OverviewView(String scope, KpiView users, KpiView pendingVerifications,
            KpiView pendingGuideApplications, KpiView trips, Map<String, Long> tripsByStatus, Instant generatedAt) {}

    /** No email or other contact detail exists to show. {@code shortId} is the last 8 hex digits. */
    public record UserView(UUID id, String shortId, String displayName, String role, boolean verified,
            boolean demo, boolean sample, Instant createdAt) {}

    public record UserListView(List<UserView> items, int page, int size, boolean hasMore, Long total) {}

    /** Admins see a trip's title, place, dates and status, never its notes. */
    public record TripView(UUID id, String title, String destination, String startDate, String endDate,
            String status, String owner, boolean sample, Instant createdAt) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TripListView(List<TripView> items, int page, int size, boolean hasMore, Long total) {}

    private static final Set<String> ROLES = Set.of("traveller", "guide", "admin");
    private static final Set<String> USER_SORTS = Set.of("created_desc", "created_asc", "name_asc", "name_desc");
    private static final Set<String> TRIP_SORTS = Set.of("start_desc", "start_asc", "created_desc");
    private static final int PAGE_SIZE = 20;

    private final AdminRepository admin;
    private final TripRepository trips;
    private final SessionService sessions;
    private final Clock clock;

    public AdminController(AdminRepository admin, TripRepository trips, SessionService sessions, Clock clock) {
        this.admin = admin;
        this.trips = trips;
        this.sessions = sessions;
        this.clock = clock;
    }

    @GetMapping("/v1/admin/overview")
    public OverviewView overview(HttpServletRequest request) {
        User a = admin(request);
        Instant now = clock.instant();
        var o = admin.overview(a.isDemo(), now);
        return new OverviewView(a.isDemo() ? "demo" : "real", KpiView.of(o.users()),
                KpiView.of(o.pendingVerifications()), KpiView.of(o.pendingGuideApplications()), KpiView.of(o.trips()),
                Map.of("planned", o.tripsPlanned(), "ongoing", o.tripsOngoing(), "completed", o.tripsCompleted(),
                        "cancelled", o.tripsCancelled()),
                now);
    }

    @GetMapping("/v1/admin/users")
    public UserListView users(@RequestParam(required = false) String role,
            @RequestParam(required = false) String verified, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "created_desc") String sort, @RequestParam(defaultValue = "0") int page,
            @RequestParam(required = false) Integer size, HttpServletRequest request) {
        User a = admin(request);
        String r = blankToNull(role);
        if (r != null && !ROLES.contains(r)) {
            throw new PasskeyException(400, "invalid_role");
        }
        Boolean v = switch (blankToNull(verified) == null ? "" : verified) {
            case "" -> null;
            case "true" -> true;
            case "false" -> false;
            default -> throw new PasskeyException(400, "invalid_filter");
        };
        if (!USER_SORTS.contains(sort)) {
            throw new PasskeyException(400, "invalid_sort");
        }
        var filter = new AdminRepository.UserFilter(r, v, PlainText.searchPattern(q));
        int p = Page.page(page);
        int s = Page.size(size, PAGE_SIZE);
        var rows = admin.users(a.isDemo(), filter, sort, s + 1, p * s);
        var pg = Page.of(rows, p, s, admin.countUsers(a.isDemo(), filter));
        return new UserListView(pg.items().stream()
                .map(u -> new UserView(u.id(), shortId(u.id()), u.displayName(), u.role(), u.verified(), u.isDemo(),
                        u.isSample(), u.createdAt()))
                .toList(), pg.page(), pg.size(), pg.hasMore(), pg.total());
    }

    @GetMapping("/v1/admin/trips")
    public TripListView trips(@RequestParam(required = false) String status,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "start_desc") String sort, @RequestParam(defaultValue = "0") int page,
            @RequestParam(required = false) Integer size, HttpServletRequest request) {
        User a = admin(request);
        String st = blankToNull(status);
        if (st != null && !TripRepository.STATUSES.contains(st)) {
            throw new PasskeyException(400, "invalid_status");
        }
        if (!TRIP_SORTS.contains(sort)) {
            throw new PasskeyException(400, "invalid_sort");
        }
        String pattern = PlainText.searchPattern(q);
        int p = Page.page(page);
        int s = Page.size(size, PAGE_SIZE);
        var rows = trips.listInScope(a.isDemo(), st, pattern, sort, s + 1, p * s);
        var pg = Page.of(rows, p, s, trips.countInScope(a.isDemo(), st, pattern));
        return new TripListView(pg.items().stream()
                .map(t -> new TripView(t.id(), t.title(), t.destination(), t.startDate().toString(),
                        t.endDate().toString(), t.status(), t.ownerDisplayName(), t.isSample(), t.createdAt()))
                .toList(), pg.page(), pg.size(), pg.hasMore(), pg.total());
    }

    static String shortId(UUID id) {
        String hex = id.toString().replace("-", "");
        return hex.substring(hex.length() - 8);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private User admin(HttpServletRequest request) {
        return Access.admin(sessions.currentSession(SessionCookie.read(request))
                .orElseThrow(() -> new PasskeyException(401, "unauthenticated")));
    }
}
