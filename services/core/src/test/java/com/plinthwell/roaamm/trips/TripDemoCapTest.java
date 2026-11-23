package com.plinthwell.roaamm.trips;

import static com.plinthwell.roaamm.support.TestAccounts.browser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** Shared demo users are never blocked at the cap: their oldest visitor-made trips make room. */
@TestPropertySource(properties = "roaamm.trips.max-per-user=5")
class TripDemoCapTest extends PostgresTest {

    static final UUID DEMO_TRAVELLER = UUID.fromString("00000000-0000-4000-8000-000000000001");

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    @Test
    void demoTripsAreTrimmedAndSamplesAreKept() throws Exception {
        Cookie demo = new TestAccounts(mvc, json, jdbc).demo("traveller");
        for (int i = 0; i < 6; i++) {
            mvc.perform(browser(post("/v1/trips")).cookie(demo).content(json.writeValueAsString(
                    TripTest.trip("Visitor " + i)))).andExpect(status().isCreated());
        }
        int total = jdbc.sql("SELECT count(*) FROM trips WHERE user_id = :u").param("u", DEMO_TRAVELLER)
                .query(Integer.class).single();
        int samples = jdbc.sql("SELECT count(*) FROM trips WHERE user_id = :u AND is_sample")
                .param("u", DEMO_TRAVELLER).query(Integer.class).single();
        assertThat(total).isEqualTo(5);
        assertThat(samples).isEqualTo(3);
        assertThat(jdbc.sql("SELECT title FROM trips WHERE user_id = :u AND NOT is_sample ORDER BY created_at DESC")
                .param("u", DEMO_TRAVELLER).query(String.class).list()).containsExactly("Visitor 5", "Visitor 4");
    }
}
