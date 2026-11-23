package com.plinthwell.roaamm.auth;

import com.plinthwell.roaamm.passkey.PasskeyException;

/** Role checks shared by the member and admin endpoints. */
public final class Access {

    private Access() {}

    /** A traveller or guide (real or demo). Admins are not members. */
    public static User member(SessionService.Current current) {
        User u = current.user();
        if (u.role() == Role.ADMIN) {
            throw new PasskeyException(403, "forbidden");
        }
        return u;
    }

    /** Any admin, including the read-only demo admin. Every admin query is scoped by {@code isDemo()}. */
    public static User admin(SessionService.Current current) {
        User u = current.user();
        if (u.role() != Role.ADMIN) {
            throw new PasskeyException(403, "forbidden");
        }
        return u;
    }

    /**
     * An admin who may change data. The web layer already refuses every write
     * from the demo admin (ReadOnlyDemoInterceptor); this is the second check.
     */
    public static User writableAdmin(SessionService.Current current) {
        User u = admin(current);
        if (u.isReadOnlyDemo()) {
            throw new PasskeyException(403, "read_only_demo");
        }
        return u;
    }
}
