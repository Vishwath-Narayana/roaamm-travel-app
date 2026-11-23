package com.plinthwell.roaamm.common;

import com.plinthwell.roaamm.passkey.AuthRateLimits;
import com.plinthwell.roaamm.passkey.PasskeyException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Errors are small JSON objects. No stack traces, no exception messages. */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<Map<String, String>> badRequest(Exception e) {
        return body(HttpStatus.BAD_REQUEST, "bad_request");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> method(Exception e) {
        return body(HttpStatus.METHOD_NOT_ALLOWED, "method_not_allowed");
    }

    @ExceptionHandler(PasskeyException.class)
    public ResponseEntity<Map<String, String>> passkey(PasskeyException e) {
        return body(HttpStatus.valueOf(e.status()), e.code());
    }

    @ExceptionHandler(AuthRateLimits.RateLimitedException.class)
    public ResponseEntity<Map<String, String>> rateLimited(AuthRateLimits.RateLimitedException e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Cache-Control", "no-store")
                .header("Retry-After", Long.toString(e.retryAfterSeconds()))
                .body(Map.of("error", "rate_limited"));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> database(DataAccessException e) {
        // Class name only: driver messages can name the database host.
        log.warn("database error: {}", e.getClass().getSimpleName());
        return body(HttpStatus.SERVICE_UNAVAILABLE, "database_unavailable");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception e) {
        log.error("unhandled error: {}", causeChain(e));
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error");
    }

    /** Class names of the cause chain (and the top frame), never messages: they can hold secrets. */
    static String causeChain(Throwable t) {
        StringBuilder sb = new StringBuilder();
        for (Throwable c = t; c != null && sb.length() < 2000; c = c.getCause() == c ? null : c.getCause()) {
            if (!sb.isEmpty()) {
                sb.append(" <- ");
            }
            sb.append(c.getClass().getName());
            StackTraceElement[] st = c.getStackTrace();
            // The root cause gets a few frames: enough to find the failing call.
            int frames = c.getCause() == null ? Math.min(12, st.length) : Math.min(1, st.length);
            for (int i = 0; i < frames; i++) {
                sb.append(i == 0 ? " at " : " / ").append(st[i].getClassName()).append('.').append(st[i].getMethodName());
            }
        }
        return sb.toString();
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String code) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(Map.of("error", code));
    }
}
