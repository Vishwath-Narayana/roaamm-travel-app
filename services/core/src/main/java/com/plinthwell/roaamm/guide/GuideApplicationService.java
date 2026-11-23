package com.plinthwell.roaamm.guide;

import com.plinthwell.roaamm.audit.AuditLog;
import com.plinthwell.roaamm.auth.Access;
import com.plinthwell.roaamm.auth.Role;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.auth.User;
import com.plinthwell.roaamm.common.BulkIds;
import com.plinthwell.roaamm.common.Page;
import com.plinthwell.roaamm.common.PlainText;
import com.plinthwell.roaamm.passkey.PasskeyException;
import com.plinthwell.roaamm.verification.VerificationRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Guide applications (ADR 0008). A verified traveller applies; an admin moves
 * it to review and approves or rejects it. Approving a real application makes
 * the user a guide and audits the role change. Demo and sample applications
 * only ever change status: a shared demo user's role never changes.
 */
@Service
public class GuideApplicationService {

    public static final int HEADLINE_MAX = 80;
    public static final int BIO_MAX = 600;
    public static final int NOTE_MAX = 300;
    public static final int CITY_MAX = 40;
    public static final int MAX_LANGUAGES = 5;
    public static final int MAX_CITIES = 5;

    /** ISO 639-1 codes the form offers. The web keeps the same list. */
    public static final Set<String> LANGUAGES = Set.of(
            "ar", "bn", "de", "en", "es", "fr", "hi", "id", "it", "ja", "kn", "ko", "ml", "mr", "nl", "pt",
            "ru", "sw", "ta", "te", "th", "tr", "vi", "zh");

    /** Checked values ready to store. */
    public record Fields(String headline, String bio, List<String> languages, List<String> cities) {}

    public record Input(String headline, String bio, List<String> languages, List<String> cities) {}

    /** What the member sees: their latest application (if any) and whether they may apply now. */
    public record Mine(Optional<GuideApplicationRepository.Application> latest, boolean canApply, String reason) {}

    public record Detail(GuideApplicationRepository.Application application, List<AuditLog.Event> history) {}

    public record Listing(Page<GuideApplicationRepository.Application> page, Map<String, Long> counts) {}

    /** One row of a bulk decision. {@code error} is a fixed code, null on success. */
    public record RowResult(UUID id, boolean ok, boolean changed, String status, String error) {}

    record Outcome(GuideApplicationRepository.Application application, boolean changed) {}

    private final GuideApplicationRepository repo;
    private final VerificationRepository verification;
    private final AuditLog auditLog;
    private final GuideProperties props;
    private final TransactionTemplate tx;
    private final Clock clock;

    public GuideApplicationService(GuideApplicationRepository repo, VerificationRepository verification,
            AuditLog auditLog, GuideProperties props, TransactionTemplate tx, Clock clock) {
        this.repo = repo;
        this.verification = verification;
        this.auditLog = auditLog;
        this.props = props;
        this.tx = tx;
        this.clock = clock;
    }

    // ---- members

    public Mine mine(SessionService.Current current) {
        User user = Access.member(current);
        var latest = repo.latestFor(user.id());
        String reason = blocker(user);
        return new Mine(latest, reason == null, reason);
    }

    public GuideApplicationRepository.Application apply(SessionService.Current current, Input in) {
        User user = Access.member(current);
        Fields f = check(in);
        UUID id = UUID.randomUUID();
        return tx.execute(status -> {
            String reason = blocker(user);
            if (reason != null) {
                throw switch (reason) {
                    case "not_verified" -> new PasskeyException(403, "not_verified");
                    case "already_guide" -> new PasskeyException(409, "already_guide");
                    default -> new PasskeyException(409, "already_open");
                };
            }
            try {
                repo.insert(id, user.id(), f, user.isDemo(), clock.instant());
            } catch (DuplicateKeyException e) {
                throw new PasskeyException(409, "already_open"); // a concurrent apply won the unique index
            }
            if (user.isDemo()) {
                repo.trimDemoUser(user.id(), props.maxPerDemoUser());
            }
            return repo.latestFor(user.id()).orElseThrow();
        });
    }

    /** Why the user cannot apply now, or null if they can. */
    private String blocker(User user) {
        if (user.role() == Role.GUIDE) {
            return "already_guide";
        }
        if (!verification.isVerified(user.id())) {
            return "not_verified";
        }
        // Real users: one open application. Shared demo users are capped instead (ADR 0008).
        if (!user.isDemo() && repo.hasOpen(user.id())) {
            return "already_open";
        }
        return null;
    }

    // ---- admins (scope = the admin's own is_demo)

    public Listing list(SessionService.Current current, String status, int page, Integer size) {
        User admin = Access.admin(current);
        if (status != null && !GuideApplicationRepository.STATUSES.contains(status)) {
            throw new PasskeyException(400, "invalid_status");
        }
        int p = Page.page(page);
        int s = Page.size(size, props.pageSize());
        Map<String, Long> counts = repo.countsByStatus(admin.isDemo());
        var rows = repo.list(admin.isDemo(), status, s + 1, p * s);
        return new Listing(Page.of(rows, p, s, counts.get(status == null ? "total" : status)), counts);
    }

    public Detail detail(SessionService.Current current, UUID id) {
        User admin = Access.admin(current);
        var app = repo.findInScope(id, admin.isDemo()).orElseThrow(GuideApplicationService::notFound);
        return new Detail(app, auditLog.history(id, app.userId(), admin.isDemo()));
    }

    /** submitted -> in_review. Idempotent when already in review; 409 once decided. */
    public GuideApplicationRepository.Application review(SessionService.Current current, UUID id) {
        User admin = Access.writableAdmin(current);
        return tx.execute(status -> {
            var existing = repo.findInScope(id, admin.isDemo()).orElseThrow(GuideApplicationService::notFound);
            switch (existing.status()) {
                case "in_review" -> {
                    return existing;
                }
                case "submitted" -> {
                    Instant now = clock.instant();
                    if (!repo.markInReview(id, admin.isDemo(), admin.id(), now)) {
                        throw new PasskeyException(409, "already_decided");
                    }
                    auditLog.record(admin.id(), "guide_application.review", id, admin.isDemo(), now);
                    return repo.findInScope(id, admin.isDemo()).orElseThrow();
                }
                default -> throw new PasskeyException(409, "already_decided");
            }
        });
    }

    public GuideApplicationRepository.Application decide(SessionService.Current current, UUID id, String decision,
            String noteInput) {
        User admin = Access.writableAdmin(current);
        String target = target(decision);
        return decideAs(admin, id, target, note(target, noteInput)).application();
    }

    /** One decision and one shared note for up to 25 applications; each row in its own transaction. */
    public List<RowResult> bulkDecide(SessionService.Current current, List<String> ids, String decision,
            String noteInput) {
        User admin = Access.writableAdmin(current);
        List<UUID> rows = BulkIds.parse(ids);
        String target = target(decision);
        String note = note(target, noteInput);
        List<RowResult> results = new ArrayList<>(rows.size());
        for (UUID id : rows) {
            try {
                Outcome o = decideAs(admin, id, target, note);
                results.add(new RowResult(id, true, o.changed(), o.application().status(), null));
            } catch (PasskeyException e) {
                results.add(new RowResult(id, false, false, null, e.code()));
            }
        }
        return results;
    }

    /**
     * Decides one open application in the admin's scope, in its own
     * transaction. Package-private so tests can prove the role rule for demo
     * rows (the public methods refuse the read-only demo admin first).
     */
    Outcome decideAs(User admin, UUID id, String target, String note) {
        return tx.execute(status -> {
            var existing = repo.findInScope(id, admin.isDemo()).orElseThrow(GuideApplicationService::notFound);
            if ("approved".equals(existing.status()) || "rejected".equals(existing.status())) {
                if (existing.status().equals(target)) {
                    return new Outcome(existing, false); // same decision again: nothing changes
                }
                throw new PasskeyException(409, "already_decided");
            }
            Instant now = clock.instant();
            if (!repo.decide(id, admin.isDemo(), target, note, admin.id(), now)) {
                throw new PasskeyException(409, "already_decided");
            }
            boolean approve = "approved".equals(target);
            auditLog.record(admin.id(), approve ? "guide_application.approve" : "guide_application.reject", id,
                    admin.isDemo(), now);
            // Only a real application changes a role. promoteToGuide also refuses demo users itself.
            if (approve && !existing.isDemo() && repo.promoteToGuide(existing.userId())) {
                auditLog.record(admin.id(), "user.role_to_guide", existing.userId(), false, now);
            }
            return new Outcome(repo.findInScope(id, admin.isDemo()).orElseThrow(), true);
        });
    }

    // ---- housekeeping

    /** Demo visitors' applications after a day; the sample applications stay. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT5M")
    public void purge() {
        repo.deleteDemoBefore(clock.instant().minus(props.demoRetention()));
    }

    // ---- validation

    Fields check(Input in) {
        if (in == null) {
            throw new PasskeyException(400, "invalid_application");
        }
        String headline = PlainText.line(in.headline(), HEADLINE_MAX);
        if (headline == null) {
            throw new PasskeyException(400, "invalid_headline");
        }
        String bio = PlainText.block(in.bio(), BIO_MAX);
        if (bio == null) {
            throw new PasskeyException(400, "invalid_bio");
        }
        List<String> languages = distinct(in.languages(), MAX_LANGUAGES, "invalid_languages", v -> {
            String code = v == null ? "" : v.strip().toLowerCase(Locale.ROOT);
            return LANGUAGES.contains(code) ? code : null;
        });
        List<String> cities = distinct(in.cities(), MAX_CITIES, "invalid_cities",
                v -> PlainText.place(v, CITY_MAX, false));
        return new Fields(headline, bio, languages, cities);
    }

    private static List<String> distinct(List<String> values, int max, String error,
            java.util.function.UnaryOperator<String> clean) {
        if (values == null || values.isEmpty() || values.size() > max) {
            throw new PasskeyException(400, error);
        }
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String v : values) {
            String c = clean.apply(v);
            if (c == null) {
                throw new PasskeyException(400, error);
            }
            if (seen.add(c.toLowerCase(Locale.ROOT))) {
                out.add(c);
            }
        }
        return out;
    }

    private static String target(String decision) {
        if ("approve".equals(decision)) {
            return "approved";
        }
        if ("reject".equals(decision)) {
            return "rejected";
        }
        throw new PasskeyException(400, "invalid_decision");
    }

    /** A note is optional on approval and required (1 to 300 characters) on rejection. */
    private static String note(String target, String input) {
        if (input == null || input.isBlank()) {
            if ("rejected".equals(target)) {
                throw new PasskeyException(400, "note_required");
            }
            return null;
        }
        String note = PlainText.block(input, NOTE_MAX);
        if (note == null) {
            throw new PasskeyException(400, "invalid_note");
        }
        return note;
    }

    private static PasskeyException notFound() {
        return new PasskeyException(404, "not_found");
    }
}
