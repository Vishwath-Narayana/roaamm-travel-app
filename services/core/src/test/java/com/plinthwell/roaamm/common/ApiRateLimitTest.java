package com.plinthwell.roaamm.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.CsrfFilter;
import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;

@TestPropertySource(properties = {
    "roaamm.api-rate-limit.read.max-per-window=3",
    "roaamm.api-rate-limit.trip-write.max-per-window=2",
    "roaamm.api-rate-limit.guide-apply.max-per-window=1",
    "roaamm.api-rate-limit.admin-write.max-per-window=1",
})
class ApiRateLimitTest extends PostgresTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    static MockHttpServletRequestBuilder from(MockHttpServletRequestBuilder b, String ip) {
        return b.header("Origin", TestAccounts.WEB).header(CsrfFilter.HEADER, "1").header(ClientIp.HEADER, ip)
                .contentType(MediaType.APPLICATION_JSON);
    }

    void limited(MockHttpServletRequestBuilder b) throws Exception {
        mvc.perform(b).andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(content().json("{\"error\":\"rate_limited\"}", JsonCompareMode.STRICT));
    }

    @Test
    void eachBudgetIsPerIpAndSeparate() throws Exception {
        var accounts = new TestAccounts(mvc, json, jdbc);
        Cookie traveller = accounts.demo("traveller");
        Cookie admin = accounts.demo("admin");

        for (int i = 0; i < 3; i++) {
            mvc.perform(from(get("/v1/trips"), "198.51.100.1").cookie(traveller)).andExpect(status().isOk());
        }
        limited(from(get("/v1/admin/overview"), "198.51.100.1").cookie(admin));
        // Another IP has its own budget.
        mvc.perform(from(get("/v1/trips"), "198.51.100.2").cookie(traveller)).andExpect(status().isOk());

        String trip = json.writeValueAsString(com.plinthwell.roaamm.trips.TripTest.trip("Limited"));
        for (int i = 0; i < 2; i++) {
            mvc.perform(from(post("/v1/trips"), "198.51.100.3").cookie(traveller).content(trip))
                    .andExpect(status().isCreated());
        }
        limited(from(post("/v1/trips"), "198.51.100.3").cookie(traveller).content(trip));

        String form = json.writeValueAsString(com.plinthwell.roaamm.guide.GuideApplicationTest.form());
        mvc.perform(from(post("/v1/guide/application"), "198.51.100.4").cookie(traveller).content(form))
                .andExpect(status().isCreated());
        limited(from(post("/v1/guide/application"), "198.51.100.4").cookie(traveller).content(form));

        // Admin writes have their own budget; the demo admin is still refused as read-only first time.
        var real = accounts.realAdmin("Limited admin");
        mvc.perform(from(post("/v1/admin/guide-applications/bulk-decision"), "198.51.100.5").cookie(real.cookie())
                .content("{\"ids\":[\"00000000-0000-4000-8000-000000000999\"],\"decision\":\"approve\"}"))
                .andExpect(status().isOk());
        limited(from(post("/v1/admin/guide-applications/bulk-decision"), "198.51.100.5").cookie(real.cookie())
                .content("{\"ids\":[\"00000000-0000-4000-8000-000000000999\"],\"decision\":\"approve\"}"));
    }
}
