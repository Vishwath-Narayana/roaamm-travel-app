package com.plinthwell.roaamm.passkey;

/** Display names: 1 to 40 characters after trimming, no markup, no control characters. */
public final class DisplayNames {

    public static final int MAX = 40;

    private DisplayNames() {}

    /** The cleaned name, or null when it is not acceptable. */
    public static String clean(String input) {
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
            if (c == '<' || c == '>' || c == '&' || c == '"' || c == '`' || Character.isISOControl(c)
                    || Character.getType(c) == Character.FORMAT) {
                return null;
            }
        }
        return s;
    }
}
