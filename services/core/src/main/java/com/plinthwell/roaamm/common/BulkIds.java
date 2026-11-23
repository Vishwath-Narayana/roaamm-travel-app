package com.plinthwell.roaamm.common;

import com.plinthwell.roaamm.passkey.PasskeyException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/** The id list of a bulk decision: 1 to 25 UUIDs, duplicates dropped, order kept. */
public final class BulkIds {

    public static final int MAX = 25;

    private BulkIds() {}

    public static List<UUID> parse(List<String> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > MAX) {
            throw new PasskeyException(400, "invalid_ids");
        }
        LinkedHashSet<UUID> out = new LinkedHashSet<>();
        for (String id : ids) {
            if (id == null || id.length() != 36) {
                throw new PasskeyException(400, "invalid_ids");
            }
            try {
                out.add(UUID.fromString(id));
            } catch (IllegalArgumentException e) {
                throw new PasskeyException(400, "invalid_ids");
            }
        }
        return new ArrayList<>(out);
    }
}
