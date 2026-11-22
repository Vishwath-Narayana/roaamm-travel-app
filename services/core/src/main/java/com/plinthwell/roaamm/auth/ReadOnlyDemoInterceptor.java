package com.plinthwell.roaamm.auth;

import com.plinthwell.roaamm.common.ApiErrors;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * The admin demo is read-only: every write under /v1 is refused for it,
 * except signing in and out. New write endpoints are covered automatically.
 */
@Component
public class ReadOnlyDemoInterceptor implements HandlerInterceptor {

    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");
    private static final Set<String> ALWAYS_ALLOWED = Set.of("/v1/demo/session", "/v1/logout");

    private final SessionService sessions;

    public ReadOnlyDemoInterceptor(SessionService sessions) {
        this.sessions = sessions;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        if (SAFE.contains(request.getMethod()) || ALWAYS_ALLOWED.contains(request.getRequestURI())) {
            return true;
        }
        boolean readOnly = sessions.currentUser(SessionCookie.read(request))
                .map(User::isReadOnlyDemo)
                .orElse(false);
        if (readOnly) {
            ApiErrors.write(response, HttpServletResponse.SC_FORBIDDEN, "read_only_demo");
            return false;
        }
        return true;
    }
}
