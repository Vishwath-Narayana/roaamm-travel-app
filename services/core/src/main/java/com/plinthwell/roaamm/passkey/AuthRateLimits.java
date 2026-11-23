package com.plinthwell.roaamm.passkey;

import com.plinthwell.roaamm.auth.AuthProperties;
import com.plinthwell.roaamm.auth.FixedWindowLimiter;
import java.time.Clock;
import org.springframework.stereotype.Component;

/** Per-IP limits for passkey endpoints, and a much stricter one for recovery codes. */
@Component
public class AuthRateLimits {

    private final FixedWindowLimiter auth;
    private final FixedWindowLimiter recovery;

    public AuthRateLimits(AuthProperties props, Clock clock) {
        this.auth = new FixedWindowLimiter(props.authRateLimit().maxPerWindow(), props.authRateLimit().window(),
                clock);
        this.recovery = new FixedWindowLimiter(props.recoveryRateLimit().maxPerWindow(),
                props.recoveryRateLimit().window(), clock);
    }

    public void checkAuth(String ip) {
        check(auth, ip);
    }

    public void checkRecovery(String ip) {
        check(recovery, ip);
    }

    private static void check(FixedWindowLimiter limiter, String ip) {
        if (!limiter.tryAcquire(ip)) {
            throw new RateLimitedException(limiter.retryAfterSeconds(ip));
        }
    }

    public static class RateLimitedException extends RuntimeException {
        private final long retryAfterSeconds;

        public RateLimitedException(long retryAfterSeconds) {
            super("rate_limited", null, false, false);
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public long retryAfterSeconds() {
            return retryAfterSeconds;
        }
    }
}
