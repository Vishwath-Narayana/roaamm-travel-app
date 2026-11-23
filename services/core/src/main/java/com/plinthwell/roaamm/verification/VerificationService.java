package com.plinthwell.roaamm.verification;

import com.plinthwell.roaamm.audit.AuditLog;
import com.plinthwell.roaamm.auth.Access;
import com.plinthwell.roaamm.auth.FixedWindowLimiter;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.auth.User;
import com.plinthwell.roaamm.common.BulkIds;
import com.plinthwell.roaamm.common.PlainText;
import com.plinthwell.roaamm.passkey.AuthRateLimits;
import com.plinthwell.roaamm.passkey.PasskeyException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Simulated ID verification (ADR 0006). A request is a document type plus a
 * server-made sample reference; nothing a user types is stored. Admin views and
 * decisions are scoped: the demo admin sees only demo rows, a real admin only
 * real rows.
 */
@Service
public class VerificationService {

    public static final Set<String> DOC_TYPES = Set.of("passport", "national_id", "driving_licence");
    public static final Set<String> STATUSES = Set.of("pending", "verified", "rejected");

    public record Page<T>(List<T> items, int page, boolean hasMore) {}

    /** The admin queue: one page plus the number of requests per status (for the tabs). */
    public record Queue(List<VerificationRepository.Request> items, int page, boolean hasMore,
            Map<String, Long> counts) {}

    public record Detail(VerificationRepository.Request request, List<AuditLog.Event> history) {}

    /** Result of one row in a bulk decision. {@code error} is a fixed code, null on success. */
    public record RowResult(UUID id, boolean ok, boolean changed, String status, String error) {}

    private record Outcome(VerificationRepository.Request request, boolean changed) {}

    private static final String REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final VerificationRepository repo;
    private final AuditLog auditLog;
    private final VerificationProperties props;
    private final FixedWindowLimiter submitLimiter;
    private final TransactionTemplate tx;
    private final Clock clock;

    public VerificationService(VerificationRepository repo, AuditLog auditLog, VerificationProperties props,
            TransactionTemplate tx, Clock clock) {
        this.repo = repo;
        this.auditLog = auditLog;
        this.props = props;
        this.tx = tx;
        this.clock = clock;
        this.submitLimiter = new FixedWindowLimiter(props.maxPerWindow(), props.window(), clock);
    }

    // ---- travellers and guides

    public Optional<VerificationRepository.Request> mine(SessionService.Current current) {
        return repo.latestFor(Access.member(current).id());
    }

    public VerificationRepository.Request submit(SessionService.Current current, String docType, String clientIp) {
        User user = Access.member(current);
        if (docType == null || !DOC_TYPES.contains(docType)) {
            throw new PasskeyException(400, "invalid_doc_type");
        }
        if (!submitLimiter.tryAcquire(clientIp)) {
            throw new AuthRateLimits.RateLimitedException(submitLimiter.retryAfterSeconds(clientIp));
        }
        UUID id = UUID.randomUUID();
        return tx.execute(status -> {
            // Verified is final for everyone, including the shared demo users (M4a).
            if (repo.isVerified(user.id())) {
                throw new PasskeyException(409, "already_verified");
            }
            Optional<VerificationRepository.Request> latest = repo.latestFor(user.id());
            if (!user.isDemo() && latest.isPresent() && "pending".equals(latest.get().status())) {
                // Real users: one pending at a time; after a rejection they may try again.
                throw new PasskeyException(409, "already_pending");
            }
            try {
                repo.insert(id, user.id(), docType, sampleRef(), user.isDemo(), clock.instant());
            } catch (DuplicateKeyException e) {
                throw new PasskeyException(409, "already_pending");
            }
            if (user.isDemo()) {
                // Shared demo accounts: many visitors, so cap the rows instead of blocking.
                repo.trimDemoUser(user.id(), props.maxPerDemoUser());
            }
            return repo.latestFor(user.id()).orElseThrow();
        });
    }

    // ---- admins (scope = the admin's own is_demo)

    public Queue queue(SessionService.Current current, String status, String search, int page) {
        User admin = Access.admin(current);
        if (status == null || !STATUSES.contains(status)) {
            throw new PasskeyException(400, "invalid_status");
        }
        String pattern = PlainText.searchPattern(search);
        int p = com.plinthwell.roaamm.common.Page.page(page);
        var rows = repo.list(admin.isDemo(), status, pattern, props.pageSize() + 1, p * props.pageSize());
        boolean more = rows.size() > props.pageSize();
        return new Queue(more ? rows.subList(0, props.pageSize()) : rows, p, more,
                repo.countsByStatus(admin.isDemo()));
    }

    public Detail detail(SessionService.Current current, UUID id) {
        User admin = Access.admin(current);
        var request = repo.findInScope(id, admin.isDemo()).orElseThrow(() -> new PasskeyException(404, "not_found"));
        return new Detail(request, auditLog.history(id, null, admin.isDemo()));
    }

    /**
     * Approve or reject a pending request. Idempotent: repeating the same
     * decision returns the request unchanged and writes no second audit row.
     */
    public VerificationRepository.Request decide(SessionService.Current current, UUID id, String decision,
            String reasonInput) {
        User admin = Access.writableAdmin(current);
        String target = target(decision);
        String reason = reason(target, reasonInput);
        return decideRow(admin, id, target, reason).request();
    }

    /**
     * The same decision on up to 25 requests, with one shared reason. Each row
     * is decided in its own transaction and writes its own audit row, so one
     * failure never undoes the others.
     */
    public List<RowResult> bulkDecide(SessionService.Current current, List<String> ids, String decision,
            String reasonInput) {
        User admin = Access.writableAdmin(current);
        List<UUID> rows = BulkIds.parse(ids);
        String target = target(decision);
        String reason = reason(target, reasonInput);
        List<RowResult> results = new ArrayList<>(rows.size());
        for (UUID id : rows) {
            try {
                Outcome o = decideRow(admin, id, target, reason);
                results.add(new RowResult(id, true, o.changed(), o.request().status(), null));
            } catch (PasskeyException e) {
                results.add(new RowResult(id, false, false, null, e.code()));
            }
        }
        return results;
    }

    public List<AuditLog.Entry> audit(SessionService.Current current, int page) {
        User admin = Access.admin(current);
        int p = com.plinthwell.roaamm.common.Page.page(page);
        return auditLog.page(admin.isDemo(), props.pageSize() + 1, p * props.pageSize());
    }

    public int auditPageSize() {
        return props.pageSize();
    }

    // ---- housekeeping

    /** Rejected requests after 30 days; demo visitors' requests after a day. Seed rows stay. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT3M")
    public void purge() {
        Instant now = clock.instant();
        repo.deleteRejectedBefore(now.minus(props.rejectedRetention()));
        repo.deleteDemoBefore(now.minus(props.demoRetention()));
    }

    // ---- helpers

    private Outcome decideRow(User admin, UUID id, String target, String reason) {
        return tx.execute(status -> {
            var existing = repo.findInScope(id, admin.isDemo())
                    .orElseThrow(() -> new PasskeyException(404, "not_found"));
            if (!"pending".equals(existing.status())) {
                if (existing.status().equals(target)) {
                    return new Outcome(existing, false); // same decision again: nothing changes
                }
                throw new PasskeyException(409, "already_decided");
            }
            Instant now = clock.instant();
            if (!repo.decide(id, admin.isDemo(), target, reason, admin.id(), now)) {
                throw new PasskeyException(409, "already_decided");
            }
            auditLog.record(admin.id(), "verified".equals(target) ? "verification.approve" : "verification.reject",
                    id, admin.isDemo(), now);
            return new Outcome(repo.findInScope(id, admin.isDemo()).orElseThrow(), true);
        });
    }

    private static String target(String decision) {
        if ("approve".equals(decision)) {
            return "verified";
        }
        if ("reject".equals(decision)) {
            return "rejected";
        }
        throw new PasskeyException(400, "invalid_decision");
    }

    private static String reason(String target, String input) {
        if ("verified".equals(target)) {
            return null;
        }
        String reason = Reasons.clean(input);
        if (reason == null) {
            throw new PasskeyException(400, "reason_required");
        }
        return reason;
    }

    private static String sampleRef() {
        StringBuilder sb = new StringBuilder("SAMPLE-");
        for (int i = 0; i < 8; i++) {
            sb.append(REF_ALPHABET.charAt(RANDOM.nextInt(REF_ALPHABET.length())));
        }
        return sb.toString();
    }
}
