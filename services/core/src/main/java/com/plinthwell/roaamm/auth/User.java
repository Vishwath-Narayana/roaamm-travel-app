package com.plinthwell.roaamm.auth;

import java.util.UUID;

public record User(UUID id, Role role, String displayName, boolean isDemo) {

    /** The admin demo account may look at everything and change nothing. */
    public boolean isReadOnlyDemo() {
        return isDemo && role == Role.ADMIN;
    }
}
