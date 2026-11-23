package com.plinthwell.roaamm.verification;

import com.plinthwell.roaamm.auth.FixedWindowLimiter;
import com.plinthwell.roaamm.auth.Role;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.auth.User;
import com.plinthwell.roaamm.passkey.AuthRateLimits;
import com.plinthwell.roaamm.passkey.PasskeyException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
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

    private static final String REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final VerificationRepository repo;
    private final VerificationProperties props;
    private final FixedWindowLimiter submitLimiter;
    private final TransactionTemplate tx;
    private final Clock clock;

    public VerificationService(VerificationRepository repo, VerificationProperties props, TransactionTemplate tx,
            Clock clock) {
        this.repo = repo;
        this.props = props;
        this.tx = tx;
        this.clock = clock;
        this.submitLimiter = new FixedWindowLimiter(props.maxPerWindow(), props.window(), clock);
    }

    // ---- travellers and guides

    public Optional<VerificationRepository.Request> mine(SessionService.Current current) {
        return repo.latestFor(member(current).id());
    }

    public VerificationRepository.Request submit(SessionService.Current current, String docType, String clientIp) {
        User user = member(current);
        if (docType == null || !DOC_TYPES.contains(docType)) {
            throw new PasskeyException(400, "invalid_doc_type");
        }
        if (!submitLimiter.tryAcquire(clientIp)) {
            throw new AuthRateLimits.RateLimitedException(submitLimiter.retryAfterSeconds(clientIp));
        }
        UUID id = UUID.randomUUID();
        return tx.execute(status -> {
            Optional<VerificationRepository.Request> latest = repo.latestFor(user.id());
            if (!user.isDemo() && latest.isPresent()) {
                // Real users: one pending at a time; verified is final; after a rejection they may try again.
                switch (latest.get().status()) {
                    case "pending" -> throw new PasskeyException(409, "already_pending");
                    case "verified" -> throw new PasskeyException(409, "already_verified");
                    default -> { }
                }
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

    public Page<VerificationRepository.Request> queue(SessionService.Current current, String status, int page) {
        User admin = admin(current);
        if (status == null || !STATUSES.contains(status)) {
            throw new PasskeyException(400, "invalid_status");
        }
        int p = Math.max(0, page);
        var rows = repo.list(admin.isDemo(), status, props.pageSize() + 1, p * props.pageSize());
        return page(rows, p);
    }

    public VerificationRepository.Request detail(SessionService.Current current, UUID id) {
        User admin = admin(current);
        return repo.findInScope(id, admin.isDemo()).orElseThrow(() -> new PasskeyException(404, "not_found"));
    }

    /**
     * Approve or reject a pending request. Idempotent: repeating the same
     * decision returns the request unchanged and writes no second audit row.
     */
    public VerificationRepository.Request decide(SessionService.Current current, UUID id, String decision,
            String reasonInput) {
        User admin = admin(current);
        boolean approve = "approve".equals(decision);
        if (!approve && !"reject".equals(decision)) {
            throw new PasskeyException(400, "invalid_decision");
        }
        String reason = approve ? null : Reasons.clean(reasonInput);
        if (!approve && reason == null) {
            throw new PasskeyException(400, "reason_required");
        }
        String target = approve ? "verified" : "rejected";
        return tx.execute(status -> {
            var existing = repo.findInScope(id, admin.isDemo())
                    .orElseThrow(() -> new PasskeyException(404, "not_found"));
            if (!"pending".equals(existing.status())) {
                if (existing.status().equals(target)) {
                    return existing; // same decision again: nothing changes
                }
                throw new PasskeyException(409, "already_decided");
            }
            Instant now = clock.instant();
            if (!repo.decide(id, admin.isDemo(), target, reason, admin.id(), now)) {
                throw new PasskeyException(409, "already_decided");
            }
            repo.audit(admin.id(), approve ? "verification.approve" : "verification.reject", id, admin.isDemo(), now);
            return repo.findInScope(id, admin.isDemo()).orElseThrow();
        });
    }

    public Page<VerificationRepository.AuditEntry> audit(SessionService.Current current, int page) {
        User admin = admin(current);
        int p = Math.max(0, page);
        return page(repo.auditPage(admin.isDemo(), props.pageSize() + 1, p * props.pageSize()), p);
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

    private <T> Page<T> page(List<T> rows, int p) {
        boolean more = rows.size() > props.pageSize();
        return new Page<>(more ? rows.subList(0, props.pageSize()) : rows, p, more);
    }

    private static User member(SessionService.Current current) {
        User u = current.user();
        if (u.role() == Role.ADMIN) {
            throw new PasskeyException(403, "forbidden");
        }
        return u;
    }

    private static User admin(SessionService.Current current) {
        User u = current.user();
        if (u.role() != Role.ADMIN) {
            throw new PasskeyException(403, "forbidden");
        }
        return u;
    }

    private static String sampleRef() {
        StringBuilder sb = new StringBuilder("SAMPLE-");
        for (int i = 0; i < 8; i++) {
            sb.append(REF_ALPHABET.charAt(RANDOM.nextInt(REF_ALPHABET.length())));
        }
        return sb.toString();
    }
}
