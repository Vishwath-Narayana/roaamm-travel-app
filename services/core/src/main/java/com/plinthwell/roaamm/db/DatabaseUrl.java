package com.plinthwell.roaamm.db;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Turns a libpq-style {@code postgresql://user:pass@host[:port]/db?params} URI
 * (the form Neon hands out) into a JDBC URL plus separate credentials.
 *
 * <p>Error messages never include the input: it holds a password.
 */
public record DatabaseUrl(String jdbcUrl, String username, String password) {

    /** libpq parameter names that pgjdbc spells differently. */
    private static final Map<String, String> PARAM_NAMES = Map.of("channel_binding", "channelBinding");

    public static DatabaseUrl parse(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("DATABASE_URL is empty");
        }
        URI uri;
        try {
            uri = new URI(value.trim());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("DATABASE_URL is not a valid URI");
        }
        String scheme = uri.getScheme();
        if (!"postgresql".equals(scheme) && !"postgres".equals(scheme)) {
            throw new IllegalArgumentException("DATABASE_URL must start with postgresql://");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("DATABASE_URL has no host");
        }
        String rawUserInfo = uri.getRawUserInfo();
        if (rawUserInfo == null || rawUserInfo.isBlank()) {
            throw new IllegalArgumentException("DATABASE_URL has no user");
        }
        int colon = rawUserInfo.indexOf(':');
        String user = decode(colon < 0 ? rawUserInfo : rawUserInfo.substring(0, colon));
        String password = colon < 0 ? "" : decode(rawUserInfo.substring(colon + 1));

        String path = uri.getRawPath();
        String database = path == null || path.length() <= 1 ? "" : decode(path.substring(1));
        if (database.isBlank()) {
            throw new IllegalArgumentException("DATABASE_URL has no database name");
        }

        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://").append(host);
        if (uri.getPort() > 0) {
            jdbc.append(':').append(uri.getPort());
        }
        jdbc.append('/').append(database);

        List<String> params = new ArrayList<>();
        String query = uri.getRawQuery();
        if (query != null && !query.isBlank()) {
            for (String pair : query.split("&")) {
                if (pair.isEmpty()) {
                    continue;
                }
                int eq = pair.indexOf('=');
                String name = decode(eq < 0 ? pair : pair.substring(0, eq));
                String val = eq < 0 ? "" : pair.substring(eq + 1);
                params.add(PARAM_NAMES.getOrDefault(name, name) + "=" + val);
            }
        }
        if (!params.isEmpty()) {
            jdbc.append('?').append(String.join("&", params));
        }
        return new DatabaseUrl(jdbc.toString(), user, password);
    }

    private static String decode(String s) {
        return URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8);
    }

    /** Never print the password, even by accident. */
    @Override
    public String toString() {
        return "DatabaseUrl[redacted]";
    }
}
