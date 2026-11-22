package com.plinthwell.roaamm.common;

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

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> database(DataAccessException e) {
        // Class name only: driver messages can name the database host.
        log.warn("database error: {}", e.getClass().getSimpleName());
        return body(HttpStatus.SERVICE_UNAVAILABLE, "database_unavailable");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception e) {
        log.error("unhandled error: {}", e.getClass().getName());
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error");
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String code) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(Map.of("error", code));
    }
}
