package com.plinthwell.roaamm.passkey;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Recovery codes: 16 characters from an alphabet without look-alikes
 * (no 0/O, 1/I/L, U/V). Shown as XXXX-XXXX-XXXX-XXXX; dashes, spaces and case
 * are ignored when typed back. About 79 bits each, so a plain SHA-256 is enough.
 */
public final class RecoveryCodes {

    static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
    static final int LENGTH = 16;
    public static final int COUNT = 8;

    private static final SecureRandom RANDOM = new SecureRandom();

    private RecoveryCodes() {}

    public static List<String> generate() {
        List<String> codes = new ArrayList<>(COUNT);
        for (int c = 0; c < COUNT; c++) {
            StringBuilder sb = new StringBuilder(LENGTH + 3);
            for (int i = 0; i < LENGTH; i++) {
                if (i > 0 && i % 4 == 0) {
                    sb.append('-');
                }
                sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            codes.add(sb.toString());
        }
        return codes;
    }

    /** The 16 significant characters, or null if the input cannot be a code. */
    public static String normalize(String input) {
        if (input == null || input.length() > 40) {
            return null;
        }
        String s = input.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
        if (s.length() != LENGTH) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            if (ALPHABET.indexOf(s.charAt(i)) < 0) {
                return null;
            }
        }
        return s;
    }

    public static byte[] hash(String normalized) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
