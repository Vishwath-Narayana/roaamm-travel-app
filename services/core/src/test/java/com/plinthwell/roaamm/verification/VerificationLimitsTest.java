package com.plinthwell.roaamm.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.CsrfFilter;
import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@TestPropertySource(properties = {
    "roaamm.verification.max-per-window=3",
    "roaamm.verification.max-per-demo-user=2",
})
class VerificationLimitsTest extends PostgresTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    void submit(Cookie c, String ip, int expected) throws Exception {
        mvc.perform(post("/v1/verification/requests").cookie(c).header("Origin", "https://roaamm.plinthwell.com")
                        .header(CsrfFilter.HEADER, "1").header(ClientIp.HEADER, ip)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"docType\":\"passport\"}"))
                .andExpect(status().is(expected));
    }

    @Test
    void submissionsAreRateLimitedPerIpAndDemoRowsAreCapped() throws Exception {
        Cookie guide = new TestAccounts(mvc, json, jdbc).demo("guide");
        for (int i = 0; i < 3; i++) {
            submit(guide, "192.0.2.50", 200);
        }
        mvc.perform(post("/v1/verification/requests").cookie(guide).header("Origin", "https://roaamm.plinthwell.com")
                        .header(CsrfFilter.HEADER, "1").header(ClientIp.HEADER, "192.0.2.50")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"docType\":\"passport\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().json("{\"error\":\"rate_limited\"}", JsonCompareMode.STRICT));
        int rows = jdbc.sql("SELECT count(*) FROM verification_requests WHERE user_id = :u AND NOT is_seed")
                .param("u", UUID.fromString("00000000-0000-4000-8000-000000000002")).query(Integer.class).single();
        assertThat(rows).isEqualTo(2);
    }
}
