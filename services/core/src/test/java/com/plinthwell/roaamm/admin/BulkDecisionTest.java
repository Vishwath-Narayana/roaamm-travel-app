package com.plinthwell.roaamm.admin;

import static com.plinthwell.roaamm.support.TestAccounts.browser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.guide.GuideApplicationTest;
import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Bulk decisions: max 25 ids, one shared note, per-row results, one transaction and one audit row per row. */
class BulkDecisionTest extends PostgresTest {

    static final UUID SEED_PENDING = UUID.fromString("00000000-0000-4000-8000-000000000201");

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

    ResultActions bulk(Cookie c, String path, List<String> ids, String decision, String note) throws Exception {
        Map<String, Object> b = new HashMap<>();
        b.put("ids", ids);
        b.put("decision", decision);
        if (note != null) {
            b.put("note", note);
        }
        return mvc.perform(browser(post(path)).cookie(c).content(json.writeValueAsString(b)));
    }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    UUID pendingVerification(String name) throws Exception {
        var u = accounts.real(name, "traveller");
        mvc.perform(browser(post("/v1/verification/requests")).cookie(u.cookie()).content("{\"docType\":\"passport\"}"))
                .andExpect(status().isOk());
        return jdbc.sql("SELECT id FROM verification_requests WHERE user_id = :u").param("u", u.userId())
                .query(UUID.class).single();
    }

    int audits(UUID target) {
        return jdbc.sql("SELECT count(*) FROM admin_audit_log WHERE target_id = :t").param("t", target)
                .query(Integer.class).single();
    }

    @Test
    void verificationBulkDecidesEachRowOnItsOwn() throws Exception {
        var admin = accounts.realAdmin("Bulk admin");
        UUID a = pendingVerification("Bulk one");
        UUID b = pendingVerification("Bulk two");
        UUID decided = pendingVerification("Bulk three");
        String path = "/v1/admin/verification/bulk-decision";
        bulk(admin.cookie(), path, List.of(decided.toString()), "approve", null).andExpect(status().isOk());

        UUID missing = UUID.randomUUID();
        JsonNode r = body(bulk(admin.cookie(), path, List.of(a.toString(), b.toString(), a.toString(),
                decided.toString(), missing.toString(), SEED_PENDING.toString()), "reject", "Blurry sample (simulated)")
                .andExpect(status().isOk()));
        assertThat(r.get("succeeded").asInt()).isEqualTo(2);
        assertThat(r.get("failed").asInt()).isEqualTo(3);
        List<JsonNode> rows = r.get("results").valueStream().toList();
        assertThat(rows).hasSize(5); // the duplicate id is dropped, order kept
        assertThat(rows.get(0).get("status").asString()).isEqualTo("rejected");
        assertThat(rows.get(2).get("error").asString()).isEqualTo("already_decided");
        assertThat(rows.get(3).get("error").asString()).isEqualTo("not_found");
        // A demo row is invisible to a real admin.
        assertThat(rows.get(4).get("error").asString()).isEqualTo("not_found");
        assertThat(audits(a)).isOne();
        assertThat(audits(b)).isOne();
        assertThat(audits(decided)).isOne();
        assertThat(jdbc.sql("SELECT reason FROM verification_requests WHERE id = :id").param("id", b)
                .query(String.class).single()).isEqualTo("Blurry sample (simulated)");
        assertThat(jdbc.sql("SELECT status::text FROM verification_requests WHERE id = :id").param("id", SEED_PENDING)
                .query(String.class).single()).isEqualTo("pending");
    }

    @Test
    void bulkInputIsChecked() throws Exception {
        var admin = accounts.realAdmin("Bulk checker");
        for (String path : List.of("/v1/admin/verification/bulk-decision",
                "/v1/admin/guide-applications/bulk-decision")) {
            List<String> tooMany = IntStream.range(0, 26).mapToObj(i -> UUID.randomUUID().toString()).toList();
            bulk(admin.cookie(), path, tooMany, "approve", null).andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"invalid_ids\"}", JsonCompareMode.STRICT));
            bulk(admin.cookie(), path, List.of(), "approve", null).andExpect(status().isBadRequest());
            bulk(admin.cookie(), path, List.of("nope"), "approve", null).andExpect(status().isBadRequest());
            List<String> ok = List.of(UUID.randomUUID().toString());
            bulk(admin.cookie(), path, ok, "delete", null).andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"invalid_decision\"}", JsonCompareMode.STRICT));
            bulk(admin.cookie(), path, ok, "reject", "  ").andExpect(status().isBadRequest());
            // 25 is allowed: unknown ids come back as per-row not_found.
            List<String> max = IntStream.range(0, 25).mapToObj(i -> UUID.randomUUID().toString()).toList();
            JsonNode r = body(bulk(admin.cookie(), path, max, "approve", null).andExpect(status().isOk()));
            assertThat(r.get("failed").asInt()).isEqualTo(25);
        }
    }

    @Test
    void guideBulkApprovalPromotesRealApplicantsAndAuditsEveryRow() throws Exception {
        var admin = accounts.realAdmin("Guide bulk admin");
        List<UUID> users = new ArrayList<>();
        List<String> apps = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            var u = accounts.verifiedTraveller("Bulk applicant " + i);
            mvc.perform(browser(post("/v1/guide/application")).cookie(u.cookie())
                    .content(json.writeValueAsString(GuideApplicationTest.form()))).andExpect(status().isCreated());
            users.add(u.userId());
            apps.add(jdbc.sql("SELECT id::text FROM guide_applications WHERE user_id = :u").param("u", u.userId())
                    .query(String.class).single());
        }
        JsonNode r = body(bulk(admin.cookie(), "/v1/admin/guide-applications/bulk-decision", apps, "approve",
                "Welcome aboard (simulated)").andExpect(status().isOk()));
        assertThat(r.get("succeeded").asInt()).isEqualTo(3);
        for (int i = 0; i < 3; i++) {
            UUID app = UUID.fromString(apps.get(i));
            assertThat(jdbc.sql("SELECT role::text FROM users WHERE id = :u").param("u", users.get(i))
                    .query(String.class).single()).isEqualTo("guide");
            assertThat(audits(app)).isOne();
            assertThat(audits(users.get(i))).isOne();
        }
        // Same bulk again: every row is unchanged, no new audit rows.
        JsonNode again = body(bulk(admin.cookie(), "/v1/admin/guide-applications/bulk-decision", apps, "approve",
                null).andExpect(status().isOk()));
        assertThat(again.get("results").valueStream().noneMatch(n -> n.get("changed").asBoolean())).isTrue();
        assertThat(audits(UUID.fromString(apps.get(0)))).isOne();
    }

    @Test
    void theDemoAdminCannotBulkDecide() throws Exception {
        Cookie demoAdmin = accounts.demo("admin");
        bulk(demoAdmin, "/v1/admin/verification/bulk-decision", List.of(SEED_PENDING.toString()), "approve", null)
                .andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"read_only_demo\"}", JsonCompareMode.STRICT));
        bulk(demoAdmin, "/v1/admin/guide-applications/bulk-decision",
                List.of("00000000-0000-4000-8000-000000000501"), "approve", null).andExpect(status().isForbidden());
        bulk(accounts.demo("traveller"), "/v1/admin/guide-applications/bulk-decision",
                List.of("00000000-0000-4000-8000-000000000501"), "approve", null).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"forbidden\"}", JsonCompareMode.STRICT));
        assertThat(jdbc.sql("SELECT status::text FROM verification_requests WHERE id = :id").param("id", SEED_PENDING)
                .query(String.class).single()).isEqualTo("pending");
    }
}
