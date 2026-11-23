package com.plinthwell.roaamm.common;

import java.util.regex.Pattern;

/**
 * Checks for short user-typed text (titles, notes, bios). Text is trimmed and
 * runs of spaces collapse; angle brackets, control and format characters are
 * refused. Lengths count code points, like the database's length().
 * Every method returns null when the input is not acceptable.
 */
public final class PlainText {

    /** Letters (any script), marks, spaces, apostrophes, hyphens and dots: a place name. */
    private static final Pattern PLACE = Pattern.compile("[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\-]*");

    private PlainText() {}

    /** One line, 1 to {@code max} characters. */
    public static String line(String input, int max) {
        if (input == null) {
            return null;
        }
        String s = input.strip().replaceAll("\\s+", " ");
        return fits(s, 1, max) && safe(s, false) ? s : null;
    }

    /**
     * Several lines, 1 to {@code max} characters. Line breaks are kept (at most
     * two in a row); other whitespace runs collapse to one space.
     */
    public static String block(String input, int max) {
        if (input == null) {
            return null;
        }
        String s = input.replace("\r\n", "\n").replace('\r', '\n')
                .replaceAll("[\\t\\x0B\\f \\u00A0]+", " ")
                .replaceAll(" *\\n *", "\n")
                .replaceAll("\\n{3,}", "\n\n")
                .strip();
        return fits(s, 1, max) && safe(s, true) ? s : null;
    }

    /** A city ("Kyoto") or a place with a country ("Kyoto, Japan" when {@code allowComma}). */
    public static String place(String input, int max, boolean allowComma) {
        String s = line(input, max);
        if (s == null) {
            return null;
        }
        String[] parts = allowComma ? s.split(",", -1) : new String[] {s};
        if (parts.length > 3) {
            return null;
        }
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            String p = part.strip();
            if (!PLACE.matcher(p).matches()) {
                return null;
            }
            if (!out.isEmpty()) {
                out.append(", ");
            }
            out.append(p);
        }
        String result = out.toString();
        return fits(result, 1, max) ? result : null;
    }

    /**
     * An ILIKE pattern for a name search: null for no search, or the cleaned
     * text with %, _ and \\ escaped, wrapped in %. Throws on bad input.
     */
    public static String searchPattern(String input) {
        if (input == null || input.isBlank()) {
            return null;
        }
        String s = line(input, 40);
        if (s == null) {
            throw new com.plinthwell.roaamm.passkey.PasskeyException(400, "invalid_search");
        }
        return "%" + s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    private static boolean fits(String s, int min, int max) {
        int n = s.codePointCount(0, s.length());
        return n >= min && n <= max;
    }

    private static boolean safe(String s, boolean allowNewline) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\n' && allowNewline) {
                continue;
            }
            if (c == '<' || c == '>' || Character.isISOControl(c) || Character.getType(c) == Character.FORMAT) {
                return false;
            }
        }
        return true;
    }
}
