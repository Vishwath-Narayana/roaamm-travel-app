package com.plinthwell.roaamm.auth;

import java.time.Clock;
import org.springframework.stereotype.Component;

/** Demo session creation per client IP (roaamm.demo-rate-limit). */
@Component
public class DemoRateLimiter {

    private final FixedWindowLimiter limiter;

    public DemoRateLimiter(AuthProperties props, Clock clock) {
        this.limiter = new FixedWindowLimiter(props.demoRateLimit().maxPerWindow(), props.demoRateLimit().window(),
                clock);
    }

    public boolean tryAcquire(String clientIp) {
        return limiter.tryAcquire(clientIp);
    }

    public long retryAfterSeconds(String clientIp) {
        return limiter.retryAfterSeconds(clientIp);
    }
}
