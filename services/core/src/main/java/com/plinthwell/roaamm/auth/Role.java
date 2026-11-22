package com.plinthwell.roaamm.auth;

import java.util.Locale;
import java.util.Optional;

public enum Role {
    TRAVELLER,
    GUIDE,
    ADMIN;

    /** The lower-case name used in JSON and in the Postgres enum. */
    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Optional<Role> fromWire(String value) {
        if (value == null) {
            return Optional.empty();
        }
        for (Role r : values()) {
            if (r.wire().equals(value)) {
                return Optional.of(r);
            }
        }
        return Optional.empty();
    }
}
