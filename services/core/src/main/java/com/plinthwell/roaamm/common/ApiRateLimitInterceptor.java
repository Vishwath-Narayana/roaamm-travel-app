package com.plinthwell.roaamm.common;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.FixedWindowLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Clock;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Per-IP limits for the trips, guide and admin endpoints: one budget for
 * reads, and separate, smaller budgets for each kind of write. A bulk
 * decision counts as one admin write (it is capped at 25 rows).
 */
@Component
public class ApiRateLimitInterceptor implements HandlerInterceptor {

    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

    private final FixedWindowLimiter read;
    private final FixedWindowLimiter tripWrite;
    private final FixedWindowLimiter guideApply;
    private final FixedWindowLimiter adminWrite;

    public ApiRateLimitInterceptor(ApiRateLimitProperties props, Clock clock) {
        this.read = limiter(props.read(), clock);
        this.tripWrite = limiter(props.tripWrite(), clock);
        this.guideApply = limiter(props.guideApply(), clock);
        this.adminWrite = limiter(props.adminWrite(), clock);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String path = request.getRequestURI();
        FixedWindowLimiter limiter;
        if (SAFE.contains(request.getMethod())) {
            limiter = read;
        } else if (path.startsWith("/v1/admin/")) {
            limiter = adminWrite;
        } else if (path.startsWith("/v1/guide/")) {
            limiter = guideApply;
        } else {
            limiter = tripWrite;
        }
        String ip = ClientIp.of(request);
        if (limiter.tryAcquire(ip)) {
            return true;
        }
        response.setHeader("Retry-After", Long.toString(limiter.retryAfterSeconds(ip)));
        ApiErrors.write(response, 429, "rate_limited");
        return false;
    }

    private static FixedWindowLimiter limiter(ApiRateLimitProperties.Limit l, Clock clock) {
        return new FixedWindowLimiter(l.maxPerWindow(), l.window(), clock);
    }
}
