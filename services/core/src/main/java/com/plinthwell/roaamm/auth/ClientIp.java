package com.plinthwell.roaamm.auth;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The caller's IP. The roaamm-api proxy Worker sets {@code X-Roaamm-Client-Ip}
 * from Cloudflare's view of the client, overwriting anything the client sent.
 * Requests that reach Cloud Run directly can set it themselves; see ADR 0004.
 */
public final class ClientIp {

    public static final String HEADER = "X-Roaamm-Client-Ip";

    private ClientIp() {}

    public static String of(HttpServletRequest request) {
        String fromProxy = request.getHeader(HEADER);
        if (fromProxy != null && !fromProxy.isBlank() && fromProxy.length() <= 64) {
            return fromProxy.trim();
        }
        return request.getRemoteAddr();
    }
}
