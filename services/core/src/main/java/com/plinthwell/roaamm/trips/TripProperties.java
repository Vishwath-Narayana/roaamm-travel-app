package com.plinthwell.roaamm.trips;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** roaamm.trips.* (M4a). */
@ConfigurationProperties("roaamm.trips")
public record TripProperties(int maxPerUser, Duration demoRetention, int pageSize) {}
