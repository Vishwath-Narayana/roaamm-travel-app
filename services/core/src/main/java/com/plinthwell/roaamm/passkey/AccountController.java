package com.plinthwell.roaamm.passkey;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.auth.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A real user's passkeys and recovery codes. Demo users get 403. */
@RestController
@RequestMapping("/v1/me")
@RegisterReflectionForBinding({
    AccountController.CredentialView.class, AccountController.CredentialsResponse.class,
    AccountController.RecoveryCodesResponse.class, PasskeyAuthController.VerifyRequest.class
})
public class AccountController {

    public record CredentialView(String id, String label, Instant createdAt, Instant lastUsedAt, boolean backedUp,
            List<String> transports) {}

    public record CredentialsResponse(List<CredentialView> credentials, int recoveryCodesRemaining) {}

    public record RecoveryCodesResponse(List<String> recoveryCodes) {}

    private final AccountService accounts;
    private final SessionService sessions;
    private final AuthRateLimits limits;

    public AccountController(AccountService accounts, SessionService sessions, AuthRateLimits limits) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.limits = limits;
    }

    @GetMapping("/credentials")
    public CredentialsResponse list(HttpServletRequest request) {
        var current = current(request);
        var list = accounts.credentials(current).stream()
                .map(c -> new CredentialView(Base64Url.encode(c.id()), c.label(), c.createdAt(), c.lastUsedAt(),
                        c.backedUp(), c.transports().isBlank() ? List.of() : Arrays.asList(c.transports().split(","))))
                .toList();
        return new CredentialsResponse(list, accounts.unusedRecoveryCodes(current));
    }

    @PostMapping("/credentials/options")
    public AccountService.CreationResponse addOptions(HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return accounts.addOptions(current(request));
    }

    @PostMapping("/credentials/verify")
    public ResponseEntity<Void> addVerify(@RequestBody PasskeyAuthController.VerifyRequest body,
            HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        accounts.addVerify(current(request), body.challengeId(), PasskeyAuthController.json(body), body.label());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/credentials/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        accounts.deleteCredential(current(request), id);
        return ResponseEntity.noContent().build();
    }

    /** A fresh passkey check, needed before deleting a passkey or regenerating codes. */
    @PostMapping("/reauth/options")
    public AccountService.RequestResponse reauthOptions(HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return accounts.reauthOptions(current(request));
    }

    @PostMapping("/reauth/verify")
    public ResponseEntity<Void> reauthVerify(@RequestBody PasskeyAuthController.VerifyRequest body,
            HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        accounts.reauthVerify(current(request), body.challengeId(), PasskeyAuthController.json(body));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/recovery-codes/regenerate")
    public ResponseEntity<RecoveryCodesResponse> regenerate(HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(new RecoveryCodesResponse(accounts.regenerateRecoveryCodes(current(request))));
    }

    private SessionService.Current current(HttpServletRequest request) {
        return sessions.currentSession(SessionCookie.read(request))
                .orElseThrow(() -> new PasskeyException(401, "unauthenticated"));
    }
}
