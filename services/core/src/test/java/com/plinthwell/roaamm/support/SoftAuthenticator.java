package com.plinthwell.roaamm.support;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A software passkey for tests: a real P-256 key pair, real signatures, and
 * the same JSON a browser returns from navigator.credentials. No secrets: keys
 * are generated per test run and never leave memory.
 */
public final class SoftAuthenticator {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    public final byte[] credentialId = random(32);
    private final KeyPair keys;
    private byte[] userHandle;
    public long signCount;
    /** Flags to set; tests flip these to simulate bad authenticators. */
    public boolean userVerified = true;
    public boolean backupEligible = true;
    public boolean backupState = true;

    public SoftAuthenticator() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            keys = g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public String credentialIdB64() {
        return B64.encodeToString(credentialId);
    }

    /** navigator.credentials.create() for the given options' challenge, rpId and user handle. */
    public String create(String challengeB64, String rpId, String origin, String userHandleB64) {
        this.userHandle = B64D.decode(userHandleB64);
        byte[] clientData = clientData("webauthn.create", challengeB64, origin);
        ByteArrayOutputStream ad = new ByteArrayOutputStream();
        ad.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        ad.write(flags() | 0x40); // AT: attested credential data present
        ad.writeBytes(ByteBuffer.allocate(4).putInt((int) signCount).array());
        ad.writeBytes(new byte[16]); // AAGUID: zeros, as with attestation "none"
        ad.writeBytes(ByteBuffer.allocate(2).putShort((short) credentialId.length).array());
        ad.writeBytes(credentialId);
        ad.writeBytes(coseKey());
        Map<Object, Object> att = new LinkedHashMap<>();
        att.put("fmt", "none");
        att.put("attStmt", new LinkedHashMap<>());
        att.put("authData", ad.toByteArray());
        String id = credentialIdB64();
        return """
                {"id":"%s","rawId":"%s","type":"public-key","authenticatorAttachment":"platform",
                 "response":{"clientDataJSON":"%s","attestationObject":"%s","transports":["internal","hybrid"]},
                 "clientExtensionResults":{}}"""
                .formatted(id, id, B64.encodeToString(clientData), B64.encodeToString(Cbor.encode(att)));
    }

    /** navigator.credentials.get() with a discoverable credential. */
    public String get(String challengeB64, String rpId, String origin) {
        signCount = signCount == 0 ? 0 : signCount + 1;
        return getWithCount(challengeB64, rpId, origin, signCount);
    }

    public String getWithCount(String challengeB64, String rpId, String origin, long count) {
        byte[] clientData = clientData("webauthn.get", challengeB64, origin);
        ByteArrayOutputStream ad = new ByteArrayOutputStream();
        ad.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        ad.write(flags());
        ad.writeBytes(ByteBuffer.allocate(4).putInt((int) count).array());
        byte[] authData = ad.toByteArray();
        byte[] signature;
        try {
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initSign(keys.getPrivate());
            s.update(authData);
            s.update(sha256(clientData));
            signature = s.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        String id = credentialIdB64();
        return """
                {"id":"%s","rawId":"%s","type":"public-key","authenticatorAttachment":"platform",
                 "response":{"clientDataJSON":"%s","authenticatorData":"%s","signature":"%s","userHandle":"%s"},
                 "clientExtensionResults":{}}"""
                .formatted(id, id, B64.encodeToString(clientData), B64.encodeToString(authData),
                        B64.encodeToString(signature), B64.encodeToString(userHandle));
    }

    private int flags() {
        int f = 0x01; // UP
        if (userVerified) f |= 0x04;
        if (backupEligible) f |= 0x08;
        if (backupState) f |= 0x10;
        return f;
    }

    private static byte[] clientData(String type, String challengeB64, String origin) {
        return ("{\"type\":\"" + type + "\",\"challenge\":\"" + challengeB64 + "\",\"origin\":\"" + origin
                + "\",\"crossOrigin\":false}").getBytes(StandardCharsets.UTF_8);
    }

    private byte[] coseKey() {
        ECPublicKey pub = (ECPublicKey) keys.getPublic();
        Map<Object, Object> m = new LinkedHashMap<>();
        m.put(1, 2); // kty: EC2
        m.put(3, -7); // alg: ES256
        m.put(-1, 1); // crv: P-256
        m.put(-2, fixed(pub.getW().getAffineX()));
        m.put(-3, fixed(pub.getW().getAffineY()));
        return Cbor.encode(m);
    }

    private static byte[] fixed(BigInteger v) {
        byte[] b = v.toByteArray();
        byte[] out = new byte[32];
        int n = Math.min(32, b.length);
        System.arraycopy(b, b.length - n, out, 32 - n, n);
        return out;
    }

    static byte[] sha256(byte[] in) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(in);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static byte[] random(int n) {
        byte[] b = new byte[n];
        new SecureRandom().nextBytes(b);
        return b;
    }

    /** Just enough CBOR for attestation objects and COSE keys. */
    static final class Cbor {
        static byte[] encode(Object o) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            write(out, o);
            return out.toByteArray();
        }

        private static void write(ByteArrayOutputStream out, Object o) {
            if (o instanceof Integer i) {
                if (i >= 0) head(out, 0, i);
                else head(out, 1, -1L - i);
            } else if (o instanceof byte[] b) {
                head(out, 2, b.length);
                out.writeBytes(b);
            } else if (o instanceof String s) {
                byte[] b = s.getBytes(StandardCharsets.UTF_8);
                head(out, 3, b.length);
                out.writeBytes(b);
            } else if (o instanceof Map<?, ?> m) {
                head(out, 5, m.size());
                m.forEach((k, v) -> {
                    write(out, k);
                    write(out, v);
                });
            } else {
                throw new IllegalArgumentException(String.valueOf(o));
            }
        }

        private static void head(ByteArrayOutputStream out, int major, long n) {
            int mt = major << 5;
            if (n < 24) out.write(mt | (int) n);
            else if (n < 256) { out.write(mt | 24); out.write((int) n); }
            else if (n < 65536) { out.write(mt | 25); out.write((int) (n >> 8)); out.write((int) n); }
            else { out.write(mt | 26); out.writeBytes(ByteBuffer.allocate(4).putInt((int) n).array()); }
        }
    }
}
