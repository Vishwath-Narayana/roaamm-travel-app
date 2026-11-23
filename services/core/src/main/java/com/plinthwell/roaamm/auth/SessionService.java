package com.plinthwell.roaamm.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SessionService {

    public record Created(User user, String token) {}

    /** The signed-in session: who, how they signed in, and when they last proved it with a passkey. */
    public record Current(UUID sessionId, User user, boolean viaRecovery, Instant freshAuthAt) {}

    /** Most live sessions a real user can have; the oldest go first. */
    static final int MAX_PER_REAL_USER = 20;

    private final SessionRepository sessions;
    private final AuthProperties props;
    private final Clock clock;

    public SessionService(SessionRepository sessions, AuthProperties props, Clock clock) {
        this.sessions = sessions;
        this.props = props;
        this.clock = clock;
    }

    /** A new session for the fixed demo user of {@code role}. Replaces {@code previousToken} if given. */
    @Transactional
    public Optional<Created> createDemoSession(Role role, String previousToken) {
        Optional<User> user = sessions.findDemoUser(role);
        if (user.isEmpty()) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        if (SessionTokens.looksValid(previousToken)) {
            sessions.deleteByTokenHash(SessionTokens.hash(previousToken));
        }
        sessions.deleteExpired(now);
        String token = SessionTokens.newToken();
        sessions.insert(UUID.randomUUID(), user.get().id(), SessionTokens.hash(token), now,
                now.plus(props.session().ttl()));
        sessions.trimForUser(user.get().id(), props.session().maxPerDemoUser());
        return Optional.of(new Created(user.get(), token));
    }

    /**
     * A new session for a real user, replacing {@code previousToken} (for example a
     * demo session) if given. Joins the caller's transaction.
     */
    @Transactional
    public String createUserSession(User user, boolean viaRecovery, String previousToken) {
        Instant now = clock.instant();
        if (SessionTokens.looksValid(previousToken)) {
            sessions.deleteByTokenHash(SessionTokens.hash(previousToken));
        }
        sessions.deleteExpired(now);
        String token = SessionTokens.newToken();
        // A passkey sign-in counts as a fresh check; a recovery code does not.
        sessions.insert(UUID.randomUUID(), user.id(), SessionTokens.hash(token), now,
                now.plus(props.session().ttl()), viaRecovery, viaRecovery ? null : now);
        sessions.trimForUser(user.id(), MAX_PER_REAL_USER);
        return token;
    }

    public Optional<Current> currentSession(String token) {
        if (!SessionTokens.looksValid(token)) {
            return Optional.empty();
        }
        return sessions.findSessionByTokenHash(SessionTokens.hash(token), clock.instant());
    }

    public void markFresh(UUID sessionId) {
        sessions.markFresh(sessionId, clock.instant());
    }

    public void clearRecoveryFlag(UUID sessionId) {
        sessions.clearRecoveryFlag(sessionId);
    }

    public Optional<User> currentUser(String token) {
        if (!SessionTokens.looksValid(token)) {
            return Optional.empty();
        }
        return sessions.findUserByTokenHash(SessionTokens.hash(token), clock.instant());
    }

    public void logout(String token) {
        if (SessionTokens.looksValid(token)) {
            sessions.deleteByTokenHash(SessionTokens.hash(token));
        }
    }

    /** Runs while an instance is up; creation also purges, so scale-to-zero is fine. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT1M")
    public void purgeExpired() {
        sessions.deleteExpired(clock.instant());
    }
}
