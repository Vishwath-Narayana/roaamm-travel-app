package com.plinthwell.roaamm.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.http.ResponseCookie;

/**
 * The session cookie. The {@code __Host-} prefix makes the browser enforce
 * Secure, Path=/ and no Domain, so it stays on roaamm-api.plinthwell.com only.
 */
public final class SessionCookie {

    public static final String NAME = "__Host-roaamm_session";

    private SessionCookie() {}

    public static ResponseCookie issue(String token, Duration ttl) {
        return base(token).maxAge(ttl).build();
    }

    public static ResponseCookie clear() {
        return base("").maxAge(0).build();
    }

    public static String read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie c : cookies) {
            if (NAME.equals(c.getName())) {
                return c.getValue();
            }
        }
        return null;
    }

    private static ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value).path("/").secure(true).httpOnly(true).sameSite("Lax");
    }
}
