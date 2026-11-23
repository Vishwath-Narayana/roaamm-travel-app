package com.plinthwell.roaamm.verification;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** roaamm.verification.* (docs/adr/0006-simulated-verification.md). */
@ConfigurationProperties("roaamm.verification")
public record VerificationProperties(int maxPerWindow, Duration window, int maxPerDemoUser, Duration demoRetention,
        Duration rejectedRetention, int pageSize) {}
