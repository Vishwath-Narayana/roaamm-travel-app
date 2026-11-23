package com.plinthwell.roaamm.verification;

/** Rejection reasons: 1 to 200 characters after trimming, plain text only. */
final class Reasons {

    static final int MAX = 200;

    private Reasons() {}

    static String clean(String input) {
        if (input == null) {
            return null;
        }
        String s = input.strip().replaceAll("\\s+", " ");
        int length = s.codePointCount(0, s.length());
        if (length < 1 || length > MAX) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '<' || c == '>' || Character.isISOControl(c) || Character.getType(c) == Character.FORMAT) {
                return null;
            }
        }
        return s;
    }
}
