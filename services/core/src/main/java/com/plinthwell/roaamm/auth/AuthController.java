package com.plinthwell.roaamm.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class AuthController {

    public record DemoSessionRequest(String role) {}

    public record Me(String role, String displayName, boolean isDemo) {
        static Me of(User u) {
            return new Me(u.role().wire(), u.displayName(), u.isDemo());
        }
    }

    private final SessionService sessions;
    private final DemoRateLimiter rateLimiter;
    private final AuthProperties props;

    public AuthController(SessionService sessions, DemoRateLimiter rateLimiter, AuthProperties props) {
        this.sessions = sessions;
        this.rateLimiter = rateLimiter;
        this.props = props;
    }

    @PostMapping("/demo/session")
    public ResponseEntity<?> demoSession(@RequestBody(required = false) DemoSessionRequest body,
            HttpServletRequest request) {
        Optional<Role> role = Optional.ofNullable(body).flatMap(b -> Role.fromWire(b.role()));
        if (role.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "invalid_role");
        }
        String ip = ClientIp.of(request);
        if (!rateLimiter.tryAcquire(ip)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header(HttpHeaders.RETRY_AFTER, Long.toString(rateLimiter.retryAfterSeconds(ip)))
                    .body(Map.of("error", "rate_limited"));
        }
        return sessions.createDemoSession(role.get(), SessionCookie.read(request))
                .<ResponseEntity<?>>map(created -> ResponseEntity.ok()
                        .header(HttpHeaders.SET_COOKIE,
                                SessionCookie.issue(created.token(), props.session().ttl()).toString())
                        .body(Me.of(created.user())))
                .orElseGet(() -> error(HttpStatus.SERVICE_UNAVAILABLE, "demo_unavailable"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        return sessions.currentUser(SessionCookie.read(request))
                .<ResponseEntity<?>>map(u -> ResponseEntity.ok(Me.of(u)))
                .orElseGet(() -> error(HttpStatus.UNAUTHORIZED, "unauthenticated"));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        sessions.logout(SessionCookie.read(request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, SessionCookie.clear().toString())
                .build();
    }

    private static ResponseEntity<?> error(HttpStatus status, String code) {
        return ResponseEntity.status(status).body(Map.of("error", code));
    }
}
