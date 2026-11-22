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
