package com.plinthwell.roaamm.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("roaamm")
public record AuthProperties(String webOrigin, Session session, DemoRateLimit demoRateLimit) {

    public record Session(Duration ttl, int maxPerDemoUser) {}

    public record DemoRateLimit(int maxPerWindow, Duration window) {}
}
