package com.plinthwell.roaamm.common;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * roaamm.api-rate-limit.*: per client IP, in memory, per instance (like ADR 0004).
 * Applies to /v1/trips, /v1/guide and /v1/admin.
 */
@ConfigurationProperties("roaamm.api-rate-limit")
public record ApiRateLimitProperties(Limit read, Limit tripWrite, Limit guideApply, Limit adminWrite) {

    public record Limit(int maxPerWindow, Duration window) {}
}
