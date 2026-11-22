package com.plinthwell.roaamm.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Fixed-window limit on demo session creation per client IP. In memory and per
 * instance: it resets when an instance restarts or scales to zero, and two
 * instances each count separately. Good enough for a demo, not a real defence.
 */
@Component
public class DemoRateLimiter {

    private record Window(Instant start, int count) {}

    private static final int MAX_TRACKED = 10_000;

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AuthProperties props;
    private final Clock clock;

    public DemoRateLimiter(AuthProperties props, Clock clock) {
        this.props = props;
        this.clock = clock;
    }

    /** Records one attempt; false when the caller is over the limit. */
    public boolean tryAcquire(String clientIp) {
        Instant now = clock.instant();
        var limit = props.demoRateLimit();
        if (windows.size() > MAX_TRACKED) {
            windows.entrySet().removeIf(e -> !e.getValue().start().plus(limit.window()).isAfter(now));
        }
        Window w = windows.compute(clientIp, (k, old) -> old == null || !old.start().plus(limit.window()).isAfter(now)
                ? new Window(now, 1)
                : new Window(old.start(), old.count() + 1));
        return w.count() <= limit.maxPerWindow();
    }

    /** Seconds until the caller's window resets. */
    public long retryAfterSeconds(String clientIp) {
        Window w = windows.get(clientIp);
        if (w == null) {
            return 0;
        }
        long s = w.start().plus(props.demoRateLimit().window()).getEpochSecond() - clock.instant().getEpochSecond();
        return Math.max(1, s);
    }
}
