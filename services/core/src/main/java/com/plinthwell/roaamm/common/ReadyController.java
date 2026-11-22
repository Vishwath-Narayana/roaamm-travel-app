package com.plinthwell.roaamm.common;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Readiness: the database answers. /health stays database-free. */
@RestController
public class ReadyController {

    private static final Logger log = LoggerFactory.getLogger(ReadyController.class);

    private final JdbcClient jdbc;

    public ReadyController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, String>> ready() {
        try {
            jdbc.sql("SELECT 1").query(Integer.class).single();
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("status", "ok"));
        } catch (RuntimeException e) {
            log.warn("ready check failed: {}", e.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .header("Cache-Control", "no-store")
                    .body(Map.of("status", "unavailable"));
        }
    }
}
