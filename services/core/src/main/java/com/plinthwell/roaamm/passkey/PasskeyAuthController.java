package com.plinthwell.roaamm.passkey;

import com.plinthwell.roaamm.auth.AuthController.Me;
import com.plinthwell.roaamm.auth.AuthProperties;
import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.SessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Sign up, sign in and recovery. Every call is rate limited per IP; errors are generic. */
@RestController
@RequestMapping("/v1/auth")
@RegisterReflectionForBinding({
    PasskeyAuthController.RegisterOptionsRequest.class, PasskeyAuthController.VerifyRequest.class,
    PasskeyAuthController.RecoveryRequest.class, PasskeyAuthController.SignedInResponse.class,
    AccountService.CreationResponse.class, AccountService.CreationOptions.class, AccountService.RequestResponse.class,
    AccountService.RequestOptions.class, AccountService.RpEntity.class, AccountService.UserEntity.class,
    AccountService.PubKeyParam.class, AccountService.CredentialDescriptor.class,
    AccountService.AuthenticatorSelection.class, Me.class
})
public class PasskeyAuthController {

    public record RegisterOptionsRequest(String displayName, String role) {}

    public record VerifyRequest(UUID challengeId, JsonNode credential, String label) {}

    public record RecoveryRequest(String code) {}

    /** {@code recoveryCodes} is present only right after signup: shown once, never again. */
    public record SignedInResponse(String role, String displayName, boolean isDemo, boolean needsNewPasskey,
            List<String> recoveryCodes) {}

    private final AccountService accounts;
    private final AuthRateLimits limits;
    private final AuthProperties props;

    public PasskeyAuthController(AccountService accounts, AuthRateLimits limits, AuthProperties props) {
        this.accounts = accounts;
        this.limits = limits;
        this.props = props;
    }

    @PostMapping("/register/options")
    public AccountService.CreationResponse registerOptions(@RequestBody RegisterOptionsRequest body,
            HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return accounts.registerOptions(body.displayName(), body.role());
    }

    @PostMapping("/register/verify")
    public ResponseEntity<SignedInResponse> registerVerify(@RequestBody VerifyRequest body,
            HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return signedIn(accounts.registerVerify(body.challengeId(), json(body), SessionCookie.read(request)));
    }

    @PostMapping("/login/options")
    public AccountService.RequestResponse loginOptions(HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return accounts.loginOptions();
    }

    @PostMapping("/login/verify")
    public ResponseEntity<SignedInResponse> loginVerify(@RequestBody VerifyRequest body, HttpServletRequest request) {
        limits.checkAuth(ClientIp.of(request));
        return signedIn(accounts.loginVerify(body.challengeId(), json(body), SessionCookie.read(request)));
    }

    @PostMapping("/recovery")
    public ResponseEntity<SignedInResponse> recovery(@RequestBody RecoveryRequest body, HttpServletRequest request) {
        limits.checkRecovery(ClientIp.of(request));
        return signedIn(accounts.recover(body.code(), SessionCookie.read(request)));
    }

    static String json(VerifyRequest body) {
        if (body.credential() == null || !body.credential().isObject()) {
            throw new PasskeyException(400, "passkey_not_accepted");
        }
        return body.credential().toString();
    }

    private ResponseEntity<SignedInResponse> signedIn(AccountService.SignedIn s) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, SessionCookie.issue(s.token(), props.session().ttl()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new SignedInResponse(s.user().role().wire(), s.user().displayName(), false,
                        s.needsNewPasskey(), s.recoveryCodes()));
    }
}
