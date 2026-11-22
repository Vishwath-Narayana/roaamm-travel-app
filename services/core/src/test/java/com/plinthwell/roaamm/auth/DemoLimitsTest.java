package com.plinthwell.roaamm.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.support.PostgresTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = {
    "roaamm.demo-rate-limit.max-per-window=3",
    "roaamm.session.max-per-demo-user=2",
})
class DemoLimitsTest extends PostgresTest {

    static final UUID GUIDE = UUID.fromString("00000000-0000-4000-8000-000000000002");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ResultActions create(String ip, String role) throws Exception {
        return mvc.perform(post("/v1/demo/session")
                .header("Origin", "https://roaamm.plinthwell.com")
                .header(CsrfFilter.HEADER, "1")
                .header(ClientIp.HEADER, ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"" + role + "\"}"));
    }

    @Test
    void rateLimitsDemoSessionsPerIp() throws Exception {
        for (int i = 0; i < 3; i++) {
            create("203.0.113.7", "traveller").andExpect(status().isOk());
        }
        create("203.0.113.7", "traveller")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(content().json("{\"error\":\"rate_limited\"}", JsonCompareMode.STRICT));
        // Another IP is unaffected.
        create("203.0.113.8", "traveller").andExpect(status().isOk());
    }

    @Test
    void capsActiveSessionsPerDemoUser() throws Exception {
        for (int i = 0; i < 5; i++) {
            create("192.0.2." + i, "guide").andExpect(status().isOk());
        }
        int count = jdbc.sql("SELECT count(*) FROM sessions WHERE user_id = :u")
                .param("u", GUIDE).query(Integer.class).single();
        assertThat(count).isEqualTo(2);
    }
}
