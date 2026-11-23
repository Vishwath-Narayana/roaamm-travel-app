package com.plinthwell.roaamm.admin;

import static com.plinthwell.roaamm.support.TestAccounts.browser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class AdminConsoleTest extends PostgresTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, json, jdbc);
    }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    JsonNode getOk(Cookie c, String path) throws Exception {
        return body(mvc.perform(get(path).cookie(c)).andExpect(status().isOk()));
    }

    @Test
    void kpiChangeIsNullWhenThereIsNothingToCompare() {
        assertThat(AdminController.KpiView.of(new AdminRepository.Kpi(9, 4, 0)).change()).isNull();
        assertThat(AdminController.KpiView.of(new AdminRepository.Kpi(9, 6, 4)).change()).isEqualTo(50.0);
        assertThat(AdminController.KpiView.of(new AdminRepository.Kpi(9, 1, 3)).change()).isEqualTo(-66.7);
        assertThat(AdminController.KpiView.of(new AdminRepository.Kpi(0, 0, 2)).change()).isEqualTo(-100.0);
        assertThat(AdminController.shortId(UUID.fromString("00000000-0000-4000-8000-000000000203")))
                .isEqualTo("00000203");
    }

    @Test
    void overviewIsScoped() throws Exception {
        JsonNode demo = getOk(accounts.demo("admin"), "/v1/admin/overview");
        assertThat(demo.get("scope").asString()).isEqualTo("demo");
        // 3 demo users, 4 M3 sample people, 5 M4 sample applicants (and no real users).
        assertThat(demo.at("/users/value").asLong()).isGreaterThanOrEqualTo(12);
        assertThat(demo.at("/pendingGuideApplications/value").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(demo.at("/trips/value").asLong()).isGreaterThanOrEqualTo(3);
        assertThat(demo.at("/tripsByStatus/completed").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(demo.at("/users/change").isNull() || demo.at("/users/change").isNumber()).isTrue();
        long demoUsers = jdbc.sql("SELECT count(*) FROM users WHERE is_demo").query(Long.class).single();
        assertThat(demo.at("/users/value").asLong()).isEqualTo(demoUsers);

        var admin = accounts.realAdmin("Overview admin");
        JsonNode real = getOk(admin.cookie(), "/v1/admin/overview");
        assertThat(real.get("scope").asString()).isEqualTo("real");
        long realUsers = jdbc.sql("SELECT count(*) FROM users WHERE NOT is_demo").query(Long.class).single();
        assertThat(real.at("/users/value").asLong()).isEqualTo(realUsers);
        long realTrips = jdbc.sql("SELECT count(*) FROM trips WHERE NOT is_demo").query(Long.class).single();
        assertThat(real.at("/trips/value").asLong()).isEqualTo(realTrips);
    }

    @Test
    void usersListFiltersSearchesSortsAndStaysInScope() throws Exception {
        Cookie demoAdmin = accounts.demo("admin");
        JsonNode demo = getOk(demoAdmin, "/v1/admin/users?size=50");
        for (JsonNode n : demo.get("items")) {
            assertThat(n.get("demo").asBoolean()).isTrue();
            assertThat(n.has("email")).isFalse();
            assertThat(n.get("shortId").asString()).hasSize(8);
        }
        assertThat(demo.get("total").asLong()).isEqualTo(demo.get("items").size());

        JsonNode applicants = getOk(demoAdmin, "/v1/admin/users?q=applicant&sort=name_asc");
        assertThat(names(applicants)).containsExactly("Sample applicant Moss", "Sample applicant Pip",
                "Sample applicant Rook", "Sample applicant Sol", "Sample applicant Wren");
        JsonNode desc = getOk(demoAdmin, "/v1/admin/users?q=applicant&sort=name_desc&size=2");
        assertThat(names(desc)).containsExactly("Sample applicant Wren", "Sample applicant Sol");
        assertThat(desc.get("hasMore").asBoolean()).isTrue();
        assertThat(desc.get("total").asLong()).isEqualTo(5);

        JsonNode verified = getOk(demoAdmin, "/v1/admin/users?verified=true&role=traveller&size=50");
        assertThat(names(verified)).contains("Demo traveller", "Sample applicant Rook", "Sample traveller Mei");
        assertThat(verified.get("items").valueStream().allMatch(n -> n.get("verified").asBoolean())).isTrue();
        JsonNode unverified = getOk(demoAdmin, "/v1/admin/users?verified=false&size=50");
        assertThat(names(unverified)).contains("Demo guide").doesNotContain("Demo traveller");
        JsonNode admins = getOk(demoAdmin, "/v1/admin/users?role=admin");
        assertThat(names(admins)).containsExactly("Demo admin");
        // Search escapes LIKE wildcards: "%" matches only a literal percent sign.
        assertThat(getOk(demoAdmin, "/v1/admin/users?q=%25").get("items")).isEmpty();
        assertThat(getOk(demoAdmin, "/v1/admin/users?q=_").get("items")).isEmpty();

        for (String bad : List.of("role=root", "verified=maybe", "sort=email", "q=" + "x".repeat(41))) {
            mvc.perform(get("/v1/admin/users?" + bad).cookie(demoAdmin)).andExpect(status().isBadRequest());
        }

        var realUser = accounts.real("Zed Realperson", "guide");
        var admin = accounts.realAdmin("Users admin");
        JsonNode real = getOk(admin.cookie(), "/v1/admin/users?size=50&q=Realperson");
        assertThat(names(real)).containsExactly("Zed Realperson");
        assertThat(real.get("items").get(0).get("demo").asBoolean()).isFalse();
        assertThat(names(getOk(admin.cookie(), "/v1/admin/users?q=Sample"))).isEmpty();
        assertThat(names(getOk(demoAdmin, "/v1/admin/users?q=Realperson"))).isEmpty();
        assertThat(realUser.userId()).isNotNull();
    }

    @Test
    void tripsListIsReadOnlyAndScoped() throws Exception {
        var traveller = accounts.real("Trip lister", "traveller");
        mvc.perform(browser(post("/v1/trips")).cookie(traveller.cookie()).content(json.writeValueAsString(
                com.plinthwell.roaamm.trips.TripTest.trip("Real admin can see me")))).andExpect(status().isCreated());
        var admin = accounts.realAdmin("Trips admin");

        JsonNode real = getOk(admin.cookie(), "/v1/admin/trips?size=50");
        assertThat(real.get("items").valueStream().map(n -> n.get("title").asString()).toList())
                .contains("Real admin can see me").doesNotContain("Temples in autumn");
        assertThat(real.get("items").valueStream().noneMatch(n -> n.has("notes"))).isTrue();

        JsonNode demo = getOk(accounts.demo("admin"), "/v1/admin/trips?size=50&sort=start_asc");
        assertThat(demo.get("items").valueStream().map(n -> n.get("title").asString()).toList())
                .contains("Temples in autumn").doesNotContain("Real admin can see me");
        JsonNode planned = getOk(accounts.demo("admin"), "/v1/admin/trips?status=planned");
        assertThat(planned.get("items").valueStream().allMatch(n -> n.get("status").asString().equals("planned")))
                .isTrue();
        mvc.perform(get("/v1/admin/trips?status=lost").cookie(admin.cookie())).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/admin/trips?sort=owner").cookie(admin.cookie())).andExpect(status().isBadRequest());
        // Read-only: there is no write endpoint for admins on trips.
        mvc.perform(browser(post("/v1/admin/trips")).cookie(admin.cookie()).content("{}"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void verificationQueueHasCountsSearchAndDetailHistory() throws Exception {
        Cookie demoAdmin = accounts.demo("admin");
        JsonNode verified = getOk(demoAdmin, "/v1/admin/verification?status=verified&q=applicant");
        assertThat(verified.get("items").valueStream().map(n -> n.get("userDisplayName").asString()).toList())
                .hasSize(5).allMatch(n -> n.startsWith("Sample applicant"));
        assertThat(verified.at("/counts/verified").asLong()).isGreaterThanOrEqualTo(7);
        JsonNode detail = getOk(demoAdmin, "/v1/admin/verification/00000000-0000-4000-8000-000000000203");
        assertThat(detail.get("history").valueStream().map(n -> n.get("action").asString()).toList())
                .containsExactly("verification.approve");
        JsonNode audit = getOk(demoAdmin, "/v1/admin/audit");
        assertThat(audit.get("items").valueStream().map(n -> n.get("targetType").asString()).toList())
                .contains("verification", "guide_application");
        assertThat(audit.get("items").valueStream()
                .filter(n -> n.get("targetType").asString().equals("guide_application"))
                .map(n -> n.path("target").asString("")).toList()).contains("Sample applicant Moss");
    }

    @Test
    void membersCannotReadTheConsole() throws Exception {
        for (Cookie c : List.of(accounts.demo("traveller"), accounts.demo("guide"),
                accounts.real("Curious member", "guide").cookie())) {
            for (String path : List.of("/v1/admin/overview", "/v1/admin/users", "/v1/admin/trips")) {
                mvc.perform(get(path).cookie(c)).andExpect(status().isForbidden());
            }
        }
        for (String path : List.of("/v1/admin/overview", "/v1/admin/users", "/v1/admin/trips")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
    }

    static List<String> names(JsonNode page) {
        return page.get("items").valueStream().map(n -> n.get("displayName").asString()).toList();
    }
}
