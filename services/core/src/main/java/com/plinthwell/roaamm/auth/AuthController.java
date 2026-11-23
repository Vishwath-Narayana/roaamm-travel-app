package com.plinthwell.roaamm.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Optional;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// ResponseEntity<?> hides the body types from Spring AOT, so the native image
// needs them named here for Jackson to read and write the records.
@RestController
@RequestMapping("/v1")
@RegisterReflectionForBinding({AuthController.Me.class, AuthController.DemoSessionRequest.class})
public class AuthController {

    public record DemoSessionRequest(String role) {}

    /**
     * The signed-in user. {@code needsNewPasskey} is only sent for real users
     * (true after a recovery-code sign-in), so demo responses are unchanged.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Me(String role, String displayName, boolean isDemo, Boolean needsNewPasskey) {
        static Me of(User u) {
            return new Me(u.role().wire(), u.displayName(), u.isDemo(), null);
        }

        static Me of(SessionService.Current s) {
            User u = s.user();
            return new Me(u.role().wire(), u.displayName(), u.isDemo(), u.isDemo() ? null : s.viaRecovery());
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
        return sessions.currentSession(SessionCookie.read(request))
                .<ResponseEntity<?>>map(s -> ResponseEntity.ok(Me.of(s)))
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
