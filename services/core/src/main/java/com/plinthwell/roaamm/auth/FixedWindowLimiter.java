package com.plinthwell.roaamm.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fixed-window count per key (a client IP). In memory and per instance: it
 * resets when an instance restarts or scales to zero, and two instances count
 * separately. Good enough for a demo, not a real defence.
 */
public class FixedWindowLimiter {

    private record Window(Instant start, int count) {}

    private static final int MAX_TRACKED = 10_000;

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final int max;
    private final Duration window;
    private final Clock clock;

    public FixedWindowLimiter(int max, Duration window, Clock clock) {
        this.max = max;
        this.window = window;
        this.clock = clock;
    }

    /** Records one attempt; false when the key is over the limit. */
    public boolean tryAcquire(String key) {
        Instant now = clock.instant();
        if (windows.size() > MAX_TRACKED) {
            windows.entrySet().removeIf(e -> !e.getValue().start().plus(window).isAfter(now));
        }
        Window w = windows.compute(key, (k, old) -> old == null || !old.start().plus(window).isAfter(now)
                ? new Window(now, 1)
                : new Window(old.start(), old.count() + 1));
        return w.count() <= max;
    }

    /** Seconds until the key's window resets. */
    public long retryAfterSeconds(String key) {
        Window w = windows.get(key);
        if (w == null) {
            return 0;
        }
        long s = w.start().plus(window).getEpochSecond() - clock.instant().getEpochSecond();
        return Math.max(1, s);
    }
}
