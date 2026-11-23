package com.plinthwell.roaamm.passkey;

import com.plinthwell.roaamm.auth.Role;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.auth.User;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real accounts with passkeys (ADR 0005). Challenges are consumed before any
 * transaction starts, so a failed check still uses them up.
 */
@Service
public class AccountService {

    // ---- WebAuthn JSON options, as the browser expects them (binary values base64url).

    public record RpEntity(String id, String name) {}

    public record UserEntity(String id, String name, String displayName) {}

    public record PubKeyParam(String type, int alg) {}

    public record CredentialDescriptor(String type, String id, List<String> transports) {}

    public record AuthenticatorSelection(String residentKey, boolean requireResidentKey, String userVerification) {}

    public record CreationOptions(RpEntity rp, UserEntity user, String challenge, List<PubKeyParam> pubKeyCredParams,
            long timeout, String attestation, AuthenticatorSelection authenticatorSelection,
            List<CredentialDescriptor> excludeCredentials, Map<String, Boolean> extensions) {}

    public record RequestOptions(String challenge, String rpId, long timeout, String userVerification,
            List<CredentialDescriptor> allowCredentials) {}

    public record CreationResponse(UUID challengeId, CreationOptions publicKey) {}

    public record RequestResponse(UUID challengeId, RequestOptions publicKey) {}

    /** A new session; {@code recoveryCodes} only right after signup or regeneration. */
    public record SignedIn(User user, String token, boolean needsNewPasskey, List<String> recoveryCodes) {}

    static final String REGISTER = "register";
    static final String LOGIN = "login";
    static final String ADD = "add";
    static final String REAUTH = "reauth";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final List<PubKeyParam> PARAMS = PasskeyVerifier.ALGORITHMS.stream()
            .map(p -> new PubKeyParam("public-key", (int) p.getAlg().getValue()))
            .toList();
    private static final AuthenticatorSelection SELECTION =
            new AuthenticatorSelection("required", true, "required");

    private final AccountRepository accounts;
    private final SessionService sessions;
    private final PasskeyVerifier verifier;
    private final PasskeyProperties props;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AccountService(AccountRepository accounts, SessionService sessions, PasskeyVerifier verifier,
            PasskeyProperties props, TransactionTemplate tx, Clock clock) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.verifier = verifier;
        this.props = props;
        this.tx = tx;
        this.clock = clock;
    }

    // ---- sign up

    public CreationResponse registerOptions(String displayNameInput, String roleInput) {
        String name = DisplayNames.clean(displayNameInput);
        if (name == null) {
            throw new PasskeyException(400, "invalid_display_name");
        }
        Role role = Role.fromWire(roleInput).filter(r -> r != Role.ADMIN).orElse(null);
        if (role == null) {
            throw new PasskeyException(400, "invalid_role");
        }
        purge();
        requireSignupsOpen();
        byte[] handle = random(64);
        UUID id = UUID.randomUUID();
        byte[] challenge = random(32);
        Instant now = clock.instant();
        accounts.insertChallenge(id, challenge, REGISTER, null, name, role, handle, now,
                now.plus(props.challengeTtl()));
        var options = new CreationOptions(new RpEntity(props.rpId(), props.rpName()),
                new UserEntity(Base64Url.encode(handle), name, name), Base64Url.encode(challenge), PARAMS,
                props.challengeTtl().toMillis(), "none", SELECTION, List.of(), Map.of("credProps", true));
        return new CreationResponse(id, options);
    }

    public SignedIn registerVerify(UUID challengeId, String credentialJson, String previousToken) {
        var c = consume(challengeId, REGISTER);
        var credential = verifier.verifyRegistration(credentialJson, c.challenge());
        return tx.execute(status -> {
            requireSignupsOpen();
            if (accounts.credentialExists(credential.id())) {
                throw new PasskeyException(400, "passkey_not_accepted");
            }
            Instant now = clock.instant();
            User user = accounts.insertRealUser(UUID.randomUUID(), c.pendingRole(), c.pendingDisplayName(),
                    c.pendingUserHandle(), now);
            accounts.insertCredential(user.id(), credential, null, now);
            List<String> codes = newRecoveryCodes(user.id(), now);
            String token = sessions.createUserSession(user, false, previousToken);
            return new SignedIn(user, token, false, codes);
        });
    }

    // ---- sign in

    public RequestResponse loginOptions() {
        // Discoverable credentials: no username, no allowCredentials, nothing to enumerate.
        return requestOptions(LOGIN, null, List.of());
    }

    public SignedIn loginVerify(UUID challengeId, String credentialJson, String previousToken) {
        var c = consume(challengeId, LOGIN);
        var owner = checkAssertion(credentialJson, c.challenge(), null);
        return tx.execute(status -> {
            accounts.touchActive(owner.user().id(), clock.instant());
            return new SignedIn(owner.user(), sessions.createUserSession(owner.user(), false, previousToken), false,
                    null);
        });
    }

    public SignedIn recover(String codeInput, String previousToken) {
        String code = RecoveryCodes.normalize(codeInput);
        if (code == null) {
            throw new PasskeyException(401, "recovery_code_not_accepted");
        }
        return tx.execute(status -> {
            Instant now = clock.instant();
            User user = accounts.useRecoveryCode(RecoveryCodes.hash(code), now)
                    .orElseThrow(() -> new PasskeyException(401, "recovery_code_not_accepted"));
            accounts.touchActive(user.id(), now);
            return new SignedIn(user, sessions.createUserSession(user, true, previousToken), true, null);
        });
    }

    // ---- account page

    public List<AccountRepository.CredentialSummary> credentials(SessionService.Current current) {
        return accounts.listCredentials(realUser(current).id());
    }

    public int unusedRecoveryCodes(SessionService.Current current) {
        return accounts.countUnusedRecoveryCodes(realUser(current).id());
    }

    public CreationResponse addOptions(SessionService.Current current) {
        User user = realUser(current);
        byte[] handle = accounts.userHandle(user.id()).orElseThrow(() -> new PasskeyException(403, "not_for_demo"));
        UUID id = UUID.randomUUID();
        byte[] challenge = random(32);
        Instant now = clock.instant();
        accounts.insertChallenge(id, challenge, ADD, current.sessionId(), null, null, null, now,
                now.plus(props.challengeTtl()));
        List<CredentialDescriptor> exclude = accounts.credentialIds(user.id()).stream()
                .map(cid -> new CredentialDescriptor("public-key", Base64Url.encode(cid), List.of()))
                .toList();
        var options = new CreationOptions(new RpEntity(props.rpId(), props.rpName()),
                new UserEntity(Base64Url.encode(handle), user.displayName(), user.displayName()),
                Base64Url.encode(challenge), PARAMS, props.challengeTtl().toMillis(), "none", SELECTION, exclude,
                Map.of("credProps", true));
        return new CreationResponse(id, options);
    }

    public void addVerify(SessionService.Current current, UUID challengeId, String credentialJson, String label) {
        User user = realUser(current);
        String cleanLabel = label == null || label.isBlank() ? null : DisplayNames.clean(label);
        if (label != null && !label.isBlank() && cleanLabel == null) {
            throw new PasskeyException(400, "invalid_label");
        }
        var c = consume(challengeId, ADD);
        if (!current.sessionId().equals(c.sessionId())) {
            throw new PasskeyException(400, "challenge_expired");
        }
        var credential = verifier.verifyRegistration(credentialJson, c.challenge());
        tx.executeWithoutResult(status -> {
            if (accounts.credentialExists(credential.id())) {
                throw new PasskeyException(400, "passkey_not_accepted");
            }
            accounts.insertCredential(user.id(), credential, cleanLabel, clock.instant());
            // Adding a passkey is what a recovery sign-in was waiting for.
            sessions.clearRecoveryFlag(current.sessionId());
            sessions.markFresh(current.sessionId());
        });
    }

    public RequestResponse reauthOptions(SessionService.Current current) {
        User user = realUser(current);
        List<CredentialDescriptor> allow = accounts.credentialIds(user.id()).stream()
                .map(cid -> new CredentialDescriptor("public-key", Base64Url.encode(cid), List.of()))
                .toList();
        if (allow.isEmpty()) {
            throw new PasskeyException(409, "no_passkey");
        }
        return requestOptions(REAUTH, current.sessionId(), allow);
    }

    public void reauthVerify(SessionService.Current current, UUID challengeId, String credentialJson) {
        User user = realUser(current);
        var c = consume(challengeId, REAUTH);
        if (!current.sessionId().equals(c.sessionId())) {
            throw new PasskeyException(400, "challenge_expired");
        }
        checkAssertion(credentialJson, c.challenge(), user);
        sessions.markFresh(current.sessionId());
    }

    public void deleteCredential(SessionService.Current current, String idB64) {
        User user = realUser(current);
        requireFresh(current);
        byte[] id = Base64Url.decodeOrNull(idB64);
        if (id == null) {
            throw new PasskeyException(404, "not_found");
        }
        tx.executeWithoutResult(status -> {
            int count = accounts.countCredentials(user.id());
            if (count <= 1 && accounts.countUnusedRecoveryCodes(user.id()) == 0) {
                throw new PasskeyException(409, "last_passkey");
            }
            if (accounts.deleteCredential(user.id(), id) == 0) {
                throw new PasskeyException(404, "not_found");
            }
        });
    }

    public List<String> regenerateRecoveryCodes(SessionService.Current current) {
        User user = realUser(current);
        requireFresh(current);
        return tx.execute(status -> newRecoveryCodes(user.id(), clock.instant()));
    }

    // ---- housekeeping

    /** Expired challenges, and real accounts idle past the limit. Demo users are never touched. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT2M")
    public void purge() {
        Instant now = clock.instant();
        accounts.deleteExpiredChallenges(now);
        accounts.deleteInactiveRealUsers(now.minus(props.inactiveAfter()));
    }

    // ---- helpers

    private RequestResponse requestOptions(String purpose, UUID sessionId, List<CredentialDescriptor> allow) {
        UUID id = UUID.randomUUID();
        byte[] challenge = random(32);
        Instant now = clock.instant();
        accounts.insertChallenge(id, challenge, purpose, sessionId, null, null, null, now,
                now.plus(props.challengeTtl()));
        return new RequestResponse(id, new RequestOptions(Base64Url.encode(challenge), props.rpId(),
                props.challengeTtl().toMillis(), "required", allow));
    }

    /** Verifies a sign-in assertion; when {@code mustBelongTo} is set, the passkey must be theirs. */
    private AccountRepository.CredentialOwner checkAssertion(String json, byte[] challenge, User mustBelongTo) {
        var parsed = verifier.parseAssertion(json);
        var owner = accounts.findCredential(parsed.credentialId())
                .orElseThrow(() -> new PasskeyException(401, "passkey_not_accepted"));
        if (mustBelongTo != null && !owner.user().id().equals(mustBelongTo.id())) {
            throw new PasskeyException(401, "passkey_not_accepted");
        }
        // A discoverable credential must name its user, and it must be the owner.
        if (mustBelongTo == null && !PasskeyVerifier.sameBytes(parsed.userHandle(), owner.userHandle())) {
            throw new PasskeyException(401, "passkey_not_accepted");
        }
        var verified = verifier.verifyAssertion(parsed, owner.credential(), challenge);
        accounts.recordUse(owner.credential().id(), verified.signCount(), verified.backupState(), clock.instant());
        return owner;
    }

    private AccountRepository.Challenge consume(UUID challengeId, String purpose) {
        if (challengeId == null) {
            throw new PasskeyException(400, "challenge_expired");
        }
        return accounts.consumeChallenge(challengeId, purpose, clock.instant())
                .orElseThrow(() -> new PasskeyException(400, "challenge_expired"));
    }

    private void requireSignupsOpen() {
        if (accounts.countRealUsers() >= props.maxRealAccounts()) {
            throw new PasskeyException(503, "signups_paused");
        }
    }

    private void requireFresh(SessionService.Current current) {
        Instant fresh = current.freshAuthAt();
        if (fresh == null || fresh.plus(props.freshAuthWindow()).isBefore(clock.instant())) {
            throw new PasskeyException(403, "reauth_required");
        }
    }

    private static User realUser(SessionService.Current current) {
        if (current.user().isDemo()) {
            throw new PasskeyException(403, "not_for_demo");
        }
        return current.user();
    }

    private List<String> newRecoveryCodes(UUID userId, Instant now) {
        List<String> codes = RecoveryCodes.generate();
        List<byte[]> hashes = new ArrayList<>(codes.size());
        for (String code : codes) {
            hashes.add(RecoveryCodes.hash(RecoveryCodes.normalize(code)));
        }
        accounts.replaceRecoveryCodes(userId, hashes, now);
        return codes;
    }

    private static byte[] random(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return b;
    }
}
