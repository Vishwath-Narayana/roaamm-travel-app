package com.plinthwell.roaamm.passkey;

import java.util.Base64;

final class Base64Url {

    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    private Base64Url() {}

    static String encode(byte[] bytes) {
        return ENC.encodeToString(bytes);
    }

    /** Null when the input is not base64url. */
    static byte[] decodeOrNull(String s) {
        if (s == null) {
            return null;
        }
        try {
            return DEC.decode(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
