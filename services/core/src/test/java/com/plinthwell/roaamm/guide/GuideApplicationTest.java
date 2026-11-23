package com.plinthwell.roaamm.guide;

import static com.plinthwell.roaamm.support.TestAccounts.browser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.Role;
import com.plinthwell.roaamm.auth.User;
import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public class GuideApplicationTest extends PostgresTest {

    static final UUID DEMO_TRAVELLER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID DEMO_ADMIN = UUID.fromString("00000000-0000-4000-8000-000000000003");
    static final UUID SAMPLE_SUBMITTED = UUID.fromString("00000000-0000-4000-8000-000000000501");
    static final UUID SAMPLE_APPROVED = UUID.fromString("00000000-0000-4000-8000-000000000503");

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    GuideApplicationService service;

    TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, json, jdbc);
    }

    public static Map<String, Object> form() {
        Map<String, Object> m = new HashMap<>();
        m.put("headline", "Food walks in the old town");
        m.put("bio", "I lead slow food walks.\nSimulated bio for a portfolio demo.");
        m.put("languages", List.of("en", "PT"));
        m.put("cities", List.of("Lisbon", "Porto"));
        return m;
    }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    ResultActions apply(Cookie c, Map<String, Object> form) throws Exception {
        return mvc.perform(browser(post("/v1/guide/application")).cookie(c).content(json.writeValueAsString(form)));
    }

    ResultActions review(Cookie c, Object id) throws Exception {
        return mvc.perform(browser(post("/v1/admin/guide-applications/" + id + "/review")).cookie(c));
    }

    ResultActions decide(Cookie c, Object id, String decision, String note) throws Exception {
        Map<String, Object> b = new HashMap<>();
        b.put("decision", decision);
        if (note != null) {
            b.put("note", note);
        }
        return mvc.perform(browser(post("/v1/admin/guide-applications/" + id + "/decision")).cookie(c)
                .content(json.writeValueAsString(b)));
    }

    UUID applicationOf(UUID userId) {
        return jdbc.sql("SELECT id FROM guide_applications WHERE user_id = :u ORDER BY created_at DESC LIMIT 1")
                .param("u", userId).query(UUID.class).single();
    }

    String roleOf(UUID userId) {
        return jdbc.sql("SELECT role::text FROM users WHERE id = :u").param("u", userId).query(String.class).single();
    }

    int auditRows(UUID target, String action) {
        return jdbc.sql("SELECT count(*) FROM admin_audit_log WHERE target_id = :t AND action = :a")
                .param("t", target).param("a", action).query(Integer.class).single();
    }

    @Test
    void onlyVerifiedTravellersMayApply() throws Exception {
        var unverified = accounts.real("Not yet", "traveller");
        mvc.perform(get("/v1/guide/application").cookie(unverified.cookie()))
                .andExpect(content().json("{\"status\":\"none\",\"canApply\":false,\"reason\":\"not_verified\"}",
                        JsonCompareMode.STRICT));
        apply(unverified.cookie(), form()).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"not_verified\"}", JsonCompareMode.STRICT));

        // A pending verification is not enough either.
        mvc.perform(browser(post("/v1/verification/requests")).cookie(unverified.cookie())
                .content("{\"docType\":\"passport\"}")).andExpect(status().isOk());
        apply(unverified.cookie(), form()).andExpect(status().isForbidden());

        var guide = accounts.real("Already guide", "guide");
        accounts.markVerified(guide.userId(), false);
        apply(guide.cookie(), form()).andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_guide\"}", JsonCompareMode.STRICT));
        apply(accounts.demo("guide"), form()).andExpect(status().isConflict());

        apply(accounts.realAdmin("Admin applies").cookie(), form()).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"forbidden\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/v1/guide/application")).andExpect(status().isUnauthorized());
    }

    @Test
    void oneOpenApplicationPerRealUserAndRejectedUsersMayApplyAgain() throws Exception {
        var user = accounts.verifiedTraveller("Applicant one");
        var admin = accounts.realAdmin("Reviewer one");
        JsonNode created = body(apply(user.cookie(), form()).andExpect(status().isCreated()));
        assertThat(created.get("status").asString()).isEqualTo("submitted");
        assertThat(created.get("languages").valueStream().map(JsonNode::asString).toList()).containsExactly("en", "pt");

        apply(user.cookie(), form()).andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_open\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/v1/guide/application").cookie(user.cookie())).andExpect(content().json(
                "{\"status\":\"submitted\",\"canApply\":false,\"reason\":\"already_open\"}", JsonCompareMode.LENIENT));

        UUID id = applicationOf(user.userId());
        review(admin.cookie(), id).andExpect(status().isOk());
        apply(user.cookie(), form()).andExpect(status().isConflict());

        decide(admin.cookie(), id, "reject", null).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"note_required\"}", JsonCompareMode.STRICT));
        decide(admin.cookie(), id, "reject", "x".repeat(301)).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_note\"}", JsonCompareMode.STRICT));
        decide(admin.cookie(), id, "reject", "Please add more detail (simulated).").andExpect(status().isOk());
        mvc.perform(get("/v1/guide/application").cookie(user.cookie())).andExpect(content().json(
                "{\"status\":\"rejected\",\"canApply\":true,\"application\":{\"decisionNote\":"
                        + "\"Please add more detail (simulated).\"}}", JsonCompareMode.LENIENT));
        assertThat(roleOf(user.userId())).isEqualTo("traveller");

        apply(user.cookie(), form()).andExpect(status().isCreated());
        // The unique index is the last line of defence against a second open row.
        assertThat(jdbc.sql("""
                        SELECT count(*) FROM guide_applications
                        WHERE user_id = :u AND status IN ('submitted', 'in_review')""")
                .param("u", user.userId()).query(Integer.class).single()).isOne();
    }

    @Test
    void everyFieldIsValidated() throws Exception {
        Cookie c = accounts.verifiedTraveller("Form checker").cookie();
        record Case(String field, Object value, String error) {}
        List<Case> cases = List.of(
                new Case("headline", "", "invalid_headline"),
                new Case("headline", "h".repeat(81), "invalid_headline"),
                new Case("headline", "<script>", "invalid_headline"),
                new Case("bio", "b".repeat(601), "invalid_bio"),
                new Case("bio", "  ", "invalid_bio"),
                new Case("languages", List.of(), "invalid_languages"),
                new Case("languages", List.of("en", "fr", "de", "es", "it", "pt"), "invalid_languages"),
                new Case("languages", List.of("klingon"), "invalid_languages"),
                new Case("cities", List.of(), "invalid_cities"),
                new Case("cities", List.of("A", "B", "C", "D", "E", "F"), "invalid_cities"),
                new Case("cities", List.of("c".repeat(41)), "invalid_cities"),
                new Case("cities", List.of("District 9"), "invalid_cities"),
                new Case("cities", List.of("Kyoto, Japan"), "invalid_cities"));
        for (Case k : cases) {
            Map<String, Object> f = form();
            f.put(k.field(), k.value());
            apply(c, f).andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"" + k.error() + "\"}", JsonCompareMode.STRICT));
        }
        Map<String, Object> edge = form();
        edge.put("headline", "h".repeat(80));
        edge.put("bio", "b".repeat(600));
        edge.put("languages", List.of("en", "fr", "de", "es", "en"));
        edge.put("cities", List.of("Kyoto", "kyoto", "c".repeat(40), "Saint-Étienne", "L'Aquila"));
        JsonNode ok = body(apply(c, edge).andExpect(status().isCreated()));
        assertThat(ok.get("languages")).hasSize(4);
        assertThat(ok.get("cities")).hasSize(4);
    }

    @Test
    void approvingARealApplicationMakesTheUserAGuideAndAuditsIt() throws Exception {
        var user = accounts.verifiedTraveller("Future guide");
        var admin = accounts.realAdmin("Reviewer two");
        apply(user.cookie(), form()).andExpect(status().isCreated());
        UUID id = applicationOf(user.userId());

        JsonNode reviewed = body(review(admin.cookie(), id).andExpect(status().isOk()));
        assertThat(reviewed.get("status").asString()).isEqualTo("in_review");
        assertThat(reviewed.get("reviewer").asString()).isEqualTo("Reviewer two");
        review(admin.cookie(), id).andExpect(status().isOk());
        assertThat(auditRows(id, "guide_application.review")).isOne();

        decide(admin.cookie(), id, "maybe", null).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_decision\"}", JsonCompareMode.STRICT));
        decide(admin.cookie(), id, "approve", null).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"approved\"}", JsonCompareMode.LENIENT));
        assertThat(roleOf(user.userId())).isEqualTo("guide");
        assertThat(auditRows(id, "guide_application.approve")).isOne();
        assertThat(auditRows(user.userId(), "user.role_to_guide")).isOne();
        mvc.perform(get("/v1/me").cookie(user.cookie()))
                .andExpect(content().json("{\"role\":\"guide\"}", JsonCompareMode.LENIENT));

        // Idempotent; the opposite decision is a conflict; review after a decision is a conflict.
        decide(admin.cookie(), id, "approve", null).andExpect(status().isOk());
        assertThat(auditRows(id, "guide_application.approve")).isOne();
        assertThat(auditRows(user.userId(), "user.role_to_guide")).isOne();
        decide(admin.cookie(), id, "reject", "Changed my mind").andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_decided\"}", JsonCompareMode.STRICT));
        review(admin.cookie(), id).andExpect(status().isConflict());

        JsonNode detail = body(mvc.perform(get("/v1/admin/guide-applications/" + id).cookie(admin.cookie()))
                .andExpect(status().isOk()));
        assertThat(detail.get("history").valueStream().map(n -> n.get("action").asString()).toList())
                .containsExactly("guide_application.review", "guide_application.approve", "user.role_to_guide");
        apply(user.cookie(), form()).andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_guide\"}", JsonCompareMode.STRICT));
    }

    @Test
    void approvingADemoApplicationNeverChangesASharedDemoUsersRole() throws Exception {
        // The demo traveller is a simulated verified traveller and may apply; visitors are capped, not blocked.
        Cookie demo = accounts.demo("traveller");
        apply(demo, form()).andExpect(status().isCreated());
        apply(demo, form()).andExpect(status().isCreated());
        UUID id = applicationOf(DEMO_TRAVELLER);

        // The demo admin is read-only in the API...
        Cookie demoAdmin = accounts.demo("admin");
        review(demoAdmin, id).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"read_only_demo\"}", JsonCompareMode.STRICT));
        decide(demoAdmin, id, "approve", null).andExpect(status().isForbidden());
        // ...and even when the decision logic runs for a demo row, only the status changes.
        User demoAdminUser = new User(DEMO_ADMIN, Role.ADMIN, "Demo admin", true);
        var outcome = service.decideAs(demoAdminUser, id, "approved", null);
        assertThat(outcome.application().status()).isEqualTo("approved");
        assertThat(roleOf(DEMO_TRAVELLER)).isEqualTo("traveller");
        assertThat(auditRows(DEMO_TRAVELLER, "user.role_to_guide")).isZero();

        UUID sampleUser = jdbc.sql("SELECT user_id FROM guide_applications WHERE id = :id")
                .param("id", SAMPLE_SUBMITTED).query(UUID.class).single();
        // Use a copy so the fixed sample row stays "submitted" for other tests.
        UUID copy = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO guide_applications (id, user_id, headline, bio, languages, cities, is_demo, is_sample)
                        SELECT :copy, user_id, headline, bio, languages, cities, true, false
                        FROM guide_applications WHERE id = :id""")
                .param("copy", copy).param("id", SAMPLE_SUBMITTED).update();
        service.decideAs(demoAdminUser, copy, "approved", null);
        assertThat(roleOf(sampleUser)).isEqualTo("traveller");
        // The seeded approved sample application never changed its applicant either.
        UUID approvedUser = jdbc.sql("SELECT user_id FROM guide_applications WHERE id = :id")
                .param("id", SAMPLE_APPROVED).query(UUID.class).single();
        assertThat(roleOf(approvedUser)).isEqualTo("traveller");
    }

    @Test
    void scopesNeverMix() throws Exception {
        var user = accounts.verifiedTraveller("Real applicant");
        apply(user.cookie(), form()).andExpect(status().isCreated());
        UUID realId = applicationOf(user.userId());
        var admin = accounts.realAdmin("Reviewer three");
        Cookie demoAdmin = accounts.demo("admin");

        JsonNode demoList = body(mvc.perform(get("/v1/admin/guide-applications?size=50").cookie(demoAdmin))
                .andExpect(status().isOk()));
        assertThat(ids(demoList)).contains(SAMPLE_SUBMITTED.toString()).doesNotContain(realId.toString());
        for (String status : List.of("submitted", "in_review", "approved", "rejected")) {
            assertThat(demoList.at("/counts/" + status).asLong()).isPositive();
        }
        JsonNode realList = body(mvc.perform(get("/v1/admin/guide-applications?size=50").cookie(admin.cookie()))
                .andExpect(status().isOk()));
        assertThat(ids(realList)).contains(realId.toString()).doesNotContain(SAMPLE_SUBMITTED.toString());
        for (JsonNode n : realList.get("items")) {
            assertThat(n.get("sample").asBoolean()).isFalse();
        }

        mvc.perform(get("/v1/admin/guide-applications/" + realId).cookie(demoAdmin)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/admin/guide-applications/" + SAMPLE_SUBMITTED).cookie(admin.cookie()))
                .andExpect(status().isNotFound());
        review(admin.cookie(), SAMPLE_SUBMITTED).andExpect(status().isNotFound());
        decide(admin.cookie(), SAMPLE_SUBMITTED, "approve", null).andExpect(status().isNotFound());

        JsonNode filtered = body(mvc.perform(get("/v1/admin/guide-applications?status=approved").cookie(demoAdmin))
                .andExpect(status().isOk()));
        assertThat(filtered.get("items").valueStream().allMatch(n -> n.get("status").asString().equals("approved")))
                .isTrue();
        mvc.perform(get("/v1/admin/guide-applications?status=maybe").cookie(demoAdmin))
                .andExpect(status().isBadRequest());

        JsonNode seeded = body(mvc.perform(get("/v1/admin/guide-applications/" + SAMPLE_APPROVED).cookie(demoAdmin))
                .andExpect(status().isOk()));
        assertThat(seeded.get("sample").asBoolean()).isTrue();
        assertThat(seeded.get("history").valueStream().map(n -> n.get("action").asString()).toList())
                .containsExactly("guide_application.review", "guide_application.approve");
    }

    @Test
    void membersCannotUseAdminEndpoints() throws Exception {
        for (Cookie c : List.of(accounts.demo("traveller"), accounts.demo("guide"),
                accounts.real("Plain member", "traveller").cookie())) {
            mvc.perform(get("/v1/admin/guide-applications").cookie(c)).andExpect(status().isForbidden());
            mvc.perform(get("/v1/admin/guide-applications/" + SAMPLE_SUBMITTED).cookie(c))
                    .andExpect(status().isForbidden());
            review(c, SAMPLE_SUBMITTED).andExpect(status().isForbidden());
            decide(c, SAMPLE_SUBMITTED, "approve", null).andExpect(status().isForbidden());
        }
        mvc.perform(get("/v1/admin/guide-applications")).andExpect(status().isUnauthorized());
        assertThat(jdbc.sql("SELECT status::text FROM guide_applications WHERE id = :id").param("id", SAMPLE_SUBMITTED)
                .query(String.class).single()).isEqualTo("submitted");
    }

    @Test
    void purgeDeletesOldDemoVisitorApplicationsButKeepsSamplesAndRealOnes() throws Exception {
        apply(accounts.demo("traveller"), form()).andExpect(status().isCreated());
        UUID demoApp = applicationOf(DEMO_TRAVELLER);
        var user = accounts.verifiedTraveller("Real keeps");
        apply(user.cookie(), form()).andExpect(status().isCreated());
        UUID realApp = applicationOf(user.userId());
        jdbc.sql("UPDATE guide_applications SET created_at = now() - interval '25 hours' WHERE id IN (:a, :b)")
                .param("a", demoApp).param("b", realApp).update();

        service.purge();
        assertThat(jdbc.sql("SELECT count(*) FROM guide_applications WHERE id = :id").param("id", demoApp)
                .query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM guide_applications WHERE id = :id").param("id", realApp)
                .query(Integer.class).single()).isOne();
        assertThat(jdbc.sql("SELECT count(*) FROM guide_applications WHERE is_sample").query(Integer.class).single())
                .isEqualTo(5);
    }

    static List<String> ids(JsonNode page) {
        return page.get("items").valueStream().map(n -> n.get("id").asString()).toList();
    }
}
