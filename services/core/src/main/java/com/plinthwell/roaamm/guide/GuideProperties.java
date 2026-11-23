package com.plinthwell.roaamm.guide;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** roaamm.guide.* (docs/adr/0008-guide-applications.md). */
@ConfigurationProperties("roaamm.guide")
public record GuideProperties(int maxPerDemoUser, Duration demoRetention, int pageSize) {}
