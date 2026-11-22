package com.plinthwell.roaamm.auth;

import com.plinthwell.roaamm.common.ApiErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * State-changing /v1 requests must come from the web app: an exact Origin match
 * and a custom header (which a plain cross-site form cannot send).
 */
@Component
public class CsrfFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Roaamm-Csrf";
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

    private final AuthProperties props;

    public CsrfFilter(AuthProperties props) {
        this.props = props;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return SAFE.contains(request.getMethod()) || !request.getRequestURI().startsWith("/v1/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean originOk = props.webOrigin().equals(request.getHeader("Origin"));
        boolean headerOk = "1".equals(request.getHeader(HEADER));
        if (!originOk || !headerOk) {
            ApiErrors.write(response, HttpServletResponse.SC_FORBIDDEN, "csrf_rejected");
            return;
        }
        chain.doFilter(request, response);
    }
}
