package com.plinthwell.roaamm.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HealthControllerTest {

    @Test
    void reportsOk() {
        var body = new HealthController().health();
        assertThat(body).containsEntry("status", "ok").containsEntry("service", "core");
    }
}
