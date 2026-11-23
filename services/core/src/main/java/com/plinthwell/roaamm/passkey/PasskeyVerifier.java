package com.plinthwell.roaamm.passkey;

import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticatorTransport;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.attestation.authenticator.AAGUID;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.authenticator.COSEKey;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.attestation.statement.NoneAttestationStatement;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import com.webauthn4j.verifier.exception.MaliciousCounterValueException;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * The only place that talks to webauthn4j. Checks every response against one
 * expected origin (the web app, not the API host), the rpId, a single-use
 * challenge, and user verification.
 */
public class PasskeyVerifier {

    /** ES256, EdDSA, RS256: what platform authenticators and security keys use. */
    static final List<PublicKeyCredentialParameters> ALGORITHMS = List.of(
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.ES256),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.EdDSA),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.RS256));

    /** A credential verified at registration, ready to store. */
    public record NewCredential(byte[] id, byte[] aaguid, byte[] publicKeyCose, long signCount, String transports,
            boolean backupEligible, boolean backupState) {}

    /** A stored credential, as needed to check a sign-in. */
    public record StoredCredential(byte[] id, byte[] aaguid, byte[] publicKeyCose, long signCount, String transports,
            boolean backupEligible, boolean backupState) {}

    /** A parsed sign-in response: which credential it claims, before any check. */
    public record ParsedAssertion(byte[] credentialId, byte[] userHandle, AuthenticationData data) {}

    /** The verified sign-in: values to write back. */
    public record VerifiedAssertion(long signCount, boolean backupState) {}

    private final WebAuthnManager manager;
    private final ObjectConverter converter;
    private final Set<Origin> origins;
    private final String rpId;

    public PasskeyVerifier(String webOrigin, String rpId) {
        this.converter = new ObjectConverter();
        this.manager = WebAuthnManager.createNonStrictWebAuthnManager(converter);
        // Synced passkeys report 0. Fail only when the count goes down from above 0.
        this.manager.getAuthenticationDataVerifier().setMaliciousCounterValueHandler(obj -> {
            long stored = obj.getAuthenticator().getCounter();
            long presented = obj.getAuthenticatorData().getSignCount();
            if (stored > 0 && presented < stored) {
                throw new MaliciousCounterValueException("sign count went down");
            }
        });
        this.origins = Set.of(new Origin(webOrigin));
        this.rpId = rpId;
    }

    public String rpId() {
        return rpId;
    }

    public NewCredential verifyRegistration(String responseJson, byte[] challenge) {
        RegistrationData data;
        try {
            RegistrationParameters params = new RegistrationParameters(server(challenge), ALGORITHMS, true, true);
            data = manager.verifyRegistrationResponseJSON(responseJson, params);
        } catch (RuntimeException e) {
            throw new PasskeyException(400, "passkey_not_accepted");
        }
        AuthenticatorData<?> auth = data.getAttestationObject().getAuthenticatorData();
        AttestedCredentialData acd = auth.getAttestedCredentialData();
        if (acd == null || !auth.isFlagUV()) {
            throw new PasskeyException(400, "passkey_not_accepted");
        }
        byte[] cose = converter.getCborConverter().writeValueAsBytes(acd.getCOSEKey());
        return new NewCredential(acd.getCredentialId(), acd.getAaguid().getBytes(), cose, auth.getSignCount(),
                transports(data.getTransports()), auth.isFlagBE(), auth.isFlagBS());
    }

    /** Parses a sign-in response without trusting it, to find the credential it names. */
    public ParsedAssertion parseAssertion(String responseJson) {
        try {
            AuthenticationData data = manager.parseAuthenticationResponseJSON(responseJson);
            return new ParsedAssertion(data.getCredentialId(), data.getUserHandle(), data);
        } catch (RuntimeException e) {
            throw new PasskeyException(401, "passkey_not_accepted");
        }
    }

    public VerifiedAssertion verifyAssertion(ParsedAssertion assertion, StoredCredential stored, byte[] challenge) {
        try {
            COSEKey key = converter.getCborConverter().readValue(stored.publicKeyCose(), COSEKey.class);
            var acd = new AttestedCredentialData(new AAGUID(stored.aaguid()), stored.id(), key);
            var record = new CredentialRecordImpl(new NoneAttestationStatement(), true, stored.backupEligible(),
                    stored.backupState(), stored.signCount(), acd, null, null, null, parseTransports(stored.transports()));
            var params = new AuthenticationParameters(server(challenge), record, List.of(stored.id()), true, true);
            manager.verify(assertion.data(), params);
        } catch (RuntimeException e) {
            throw new PasskeyException(401, "passkey_not_accepted");
        }
        AuthenticatorData<?> auth = assertion.data().getAuthenticatorData();
        if (auth == null || !auth.isFlagUV()) {
            throw new PasskeyException(401, "passkey_not_accepted");
        }
        return new VerifiedAssertion(auth.getSignCount(), auth.isFlagBS());
    }

    /** Constant-time comparison for user handles. */
    static boolean sameBytes(byte[] a, byte[] b) {
        return a != null && b != null && java.security.MessageDigest.isEqual(a, b);
    }

    private ServerProperty server(byte[] challenge) {
        return new ServerProperty(origins, rpId, new DefaultChallenge(Arrays.copyOf(challenge, challenge.length)));
    }

    private static String transports(Set<AuthenticatorTransport> transports) {
        if (transports == null) {
            return "";
        }
        return transports.stream().map(AuthenticatorTransport::getValue)
                .filter(v -> v != null && v.matches("[a-z-]{1,20}"))
                .collect(Collectors.toCollection(TreeSet::new)).stream().limit(8).collect(Collectors.joining(","));
    }

    static Set<AuthenticatorTransport> parseTransports(String csv) {
        if (csv == null || csv.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(csv.split(",")).map(AuthenticatorTransport::create).collect(Collectors.toSet());
    }
}
