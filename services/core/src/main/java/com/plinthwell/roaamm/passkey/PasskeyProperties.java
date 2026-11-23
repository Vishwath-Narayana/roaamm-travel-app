package com.plinthwell.roaamm.passkey;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("roaamm.passkey")
public record PasskeyProperties(String rpId, String rpName, Duration challengeTtl, Duration freshAuthWindow,
        int maxRealAccounts, Duration inactiveAfter) {}
