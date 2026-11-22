package com.plinthwell.roaamm.common;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/** Small JSON error bodies for filters, where no message converter runs. */
public final class ApiErrors {

    private ApiErrors() {}

    /** {@code code} is a fixed snake_case constant, never user input. */
    public static void write(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"error\":\"" + code + "\"}");
    }
}
