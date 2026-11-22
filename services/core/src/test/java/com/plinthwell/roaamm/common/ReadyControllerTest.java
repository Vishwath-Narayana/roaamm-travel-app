package com.plinthwell.roaamm.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;

class ReadyControllerTest {

    @Test
    void returns503WhenTheDatabaseIsDown() {
        JdbcClient jdbc = mock(JdbcClient.class);
        when(jdbc.sql(anyString())).thenThrow(new DataAccessResourceFailureException("db-host.example: refused"));
        var res = new ReadyController(jdbc).ready();
        assertThat(res.getStatusCode().value()).isEqualTo(503);
        assertThat(res.getBody()).isEqualTo(Map.of("status", "unavailable"));
    }
}
