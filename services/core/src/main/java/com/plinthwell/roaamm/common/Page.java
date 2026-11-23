package com.plinthwell.roaamm.common;

import java.util.List;

/**
 * One page of a list. {@code total} is the number of matching rows, or null
 * where the list does not count them.
 */
public record Page<T>(List<T> items, int page, int size, boolean hasMore, Long total) {

    /** Largest page size any endpoint accepts. */
    public static final int MAX_SIZE = 50;
    /** Deepest page any endpoint accepts, so OFFSET stays small. */
    public static final int MAX_PAGE = 1000;

    public static int page(int requested) {
        return Math.clamp(requested, 0, MAX_PAGE);
    }

    public static int size(Integer requested, int fallback) {
        return requested == null ? fallback : Math.clamp(requested, 1, MAX_SIZE);
    }

    /** {@code rows} was fetched with LIMIT size + 1, so one extra row means there is more. */
    public static <T> Page<T> of(List<T> rows, int page, int size, Long total) {
        boolean more = rows.size() > size;
        return new Page<>(more ? rows.subList(0, size) : rows, page, size, more, total);
    }
}
