package com.plinthwell.roaamm.verification;

import static com.plinthwell.roaamm.support.TestAccounts.browser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class VerificationTest extends PostgresTest {

    static final UUID DEMO_GUIDE = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID SEED_PENDING = UUID.fromString("00000000-0000-4000-8000-000000000201");

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    VerificationService service;

    TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, json, jdbc);
    }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    ResultActions submit(Cookie c, String docType) throws Exception {
        return mvc.perform(browser(post("/v1/verification/requests")).cookie(c)
                .content("{\"docType\":\"" + docType + "\"}"));
    }

    ResultActions decide(Cookie c, Object id, String decision, String reason) throws Exception {
        String r = reason == null ? "" : ",\"reason\":" + json.writeValueAsString(reason);
        return mvc.perform(browser(post("/v1/admin/verification/" + id + "/decision")).cookie(c)
                .content("{\"decision\":\"" + decision + "\"" + r + "}"));
    }

    List<String> queueIds(Cookie admin, String status) throws Exception {
        JsonNode page = body(mvc.perform(get("/v1/admin/verification?status=" + status).cookie(admin))
                .andExpect(status().isOk()));
        return page.get("items").valueStream().map(n -> n.get("id").asString()).toList();
    }

    @Test
    void submittingStoresOnlyATypeAndASampleReference() throws Exception {
        var a = accounts.real("Nia", "guide");
        mvc.perform(get("/v1/verification/me").cookie(a.cookie())).andExpect(content().json(
                "{\"status\":\"none\",\"simulated\":true}", JsonCompareMode.STRICT));
        // Anything beyond docType is ignored: no number, photo or name can be sent in.
        JsonNode r = body(mvc.perform(browser(post("/v1/verification/requests")).cookie(a.cookie()).content("""
                        {"docType":"passport","documentNumber":"X1234567","photo":"data:image/png;base64,AAAA",
                         "fullName":"Nia Real Name"}"""))
                .andExpect(status().isOk()));
        assertThat(r.get("status").asString()).isEqualTo("pending");
        assertThat(r.get("docType").asString()).isEqualTo("passport");
        assertThat(r.get("sampleRef").asString()).matches("SAMPLE-[A-Z0-9]{8}");
        assertThat(r.get("simulated").asBoolean()).isTrue();
        assertThat(r.toString()).doesNotContain("X1234567", "Nia Real Name", "AAAA");
        List<String> columns = jdbc.sql("""
                        SELECT column_name FROM information_schema.columns
                        WHERE table_name = 'verification_requests'""").query(String.class).list();
        assertThat(columns).containsExactlyInAnyOrder("id", "user_id", "doc_type", "sample_ref", "status", "reason",
                "created_at", "decided_at", "decided_by", "is_demo", "is_seed");
        assertThat(jdbc.sql("SELECT count(*) FROM verification_requests WHERE sample_ref LIKE '%X1234567%'")
                .query(Integer.class).single()).isZero();

        submit(a.cookie(), "driving licence").andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_doc_type\"}", JsonCompareMode.STRICT));
    }

    @Test
    void realUserLifecycleWithOnePendingAndResubmitAfterRejection() throws Exception {
        var user = accounts.real("Omar", "traveller");
        var admin = accounts.realAdmin("Owner");
        String id = body(submit(user.cookie(), "national_id").andExpect(status().isOk())).get("status").asString();
        assertThat(id).isEqualTo("pending");
        submit(user.cookie(), "passport").andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_pending\"}", JsonCompareMode.STRICT));

        UUID req = jdbc.sql("SELECT id FROM verification_requests WHERE user_id = :u")
                .param("u", user.userId()).query(UUID.class).single();
        decide(admin.cookie(), req, "reject", null).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"reason_required\"}", JsonCompareMode.STRICT));
        decide(admin.cookie(), req, "reject", "x".repeat(201)).andExpect(status().isBadRequest());
        decide(admin.cookie(), req, "reject", "  Sample photo  unreadable ").andExpect(status().isOk());
        mvc.perform(get("/v1/verification/me").cookie(user.cookie())).andExpect(content().json(
                "{\"status\":\"rejected\",\"reason\":\"Sample photo unreadable\"}", JsonCompareMode.LENIENT));

        submit(user.cookie(), "passport").andExpect(status().isOk());
        UUID second = jdbc.sql("SELECT id FROM verification_requests WHERE user_id = :u AND status = 'pending'")
                .param("u", user.userId()).query(UUID.class).single();
        decide(admin.cookie(), second, "approve", null).andExpect(status().isOk());
        mvc.perform(get("/v1/verification/me").cookie(user.cookie())).andExpect(content().json(
                "{\"status\":\"verified\",\"docType\":\"passport\"}", JsonCompareMode.LENIENT));
        submit(user.cookie(), "passport").andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_verified\"}", JsonCompareMode.STRICT));
    }

    @Test
    void decisionsAreIdempotentAndAudited() throws Exception {
        var user = accounts.real("Pia", "guide");
        var admin = accounts.realAdmin("Owner two");
        submit(user.cookie(), "passport").andExpect(status().isOk());
        UUID req = jdbc.sql("SELECT id FROM verification_requests WHERE user_id = :u")
                .param("u", user.userId()).query(UUID.class).single();
        decide(admin.cookie(), req, "approve", null).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"verified\",\"decidedBy\":\"Owner two\"}",
                        JsonCompareMode.LENIENT));
        decide(admin.cookie(), req, "approve", null).andExpect(status().isOk());
        decide(admin.cookie(), req, "reject", "Too late").andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_decided\"}", JsonCompareMode.STRICT));
        decide(admin.cookie(), req, "maybe", null).andExpect(status().isBadRequest());
        assertThat(jdbc.sql("SELECT count(*) FROM admin_audit_log WHERE target_id = :t")
                .param("t", req).query(Integer.class).single()).isOne();

        JsonNode audit = body(mvc.perform(get("/v1/admin/audit").cookie(admin.cookie())).andExpect(status().isOk()));
        JsonNode mine = audit.get("items").valueStream()
                .filter(n -> n.get("targetId").asString().equals(req.toString())).findFirst().orElseThrow();
        assertThat(mine.get("action").asString()).isEqualTo("verification.approve");
        assertThat(mine.get("admin").asString()).isEqualTo("Owner two");
        assertThat(mine.get("target").asString()).isEqualTo("Pia");
    }

    @Test
    void theAuditLogIsAppendOnly() {
        UUID row = UUID.fromString("00000000-0000-4000-8000-000000000301");
        assertThatThrownBy(() -> jdbc.sql("UPDATE admin_audit_log SET action = 'x' WHERE id = :id")
                .param("id", row).update()).rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM admin_audit_log WHERE id = :id")
                .param("id", row).update()).rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.sql("TRUNCATE admin_audit_log").update()).rootCause().hasMessageContaining("append-only");
    }

    @Test
    void theDemoTravellerIsASimulatedVerifiedTravellerAndVerifiedIsFinal() throws Exception {
        Cookie demoTraveller = accounts.demo("traveller");
        mvc.perform(get("/v1/verification/me").cookie(demoTraveller))
                .andExpect(content().json("{\"status\":\"verified\",\"simulated\":true}", JsonCompareMode.LENIENT));
        submit(demoTraveller, "passport").andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"already_verified\"}", JsonCompareMode.STRICT));
    }

    @Test
    void demoAdminSeesOnlyDemoRowsAndCannotWrite() throws Exception {
        var realUser = accounts.real("Real person", "traveller");
        submit(realUser.cookie(), "passport").andExpect(status().isOk());
        UUID realReq = jdbc.sql("SELECT id FROM verification_requests WHERE user_id = :u")
                .param("u", realUser.userId()).query(UUID.class).single();

        Cookie demoGuide = accounts.demo("guide");
        submit(demoGuide, "driving_licence").andExpect(status().isOk());
        UUID demoReq = jdbc.sql("""
                        SELECT id FROM verification_requests WHERE user_id = :u ORDER BY created_at DESC LIMIT 1""")
                .param("u", DEMO_GUIDE).query(UUID.class).single();

        Cookie demoAdmin = accounts.demo("admin");
        List<String> pending = queueIds(demoAdmin, "pending");
        assertThat(pending).contains(SEED_PENDING.toString(), demoReq.toString()).doesNotContain(realReq.toString());
        for (String s : List.of("pending", "verified", "rejected")) {
            for (String id : queueIds(demoAdmin, s)) {
                assertThat(jdbc.sql("SELECT is_demo FROM verification_requests WHERE id = :id")
                        .param("id", UUID.fromString(id)).query(Boolean.class).single()).isTrue();
            }
        }
        assertThat(queueIds(demoAdmin, "verified")).isNotEmpty();
        assertThat(queueIds(demoAdmin, "rejected")).isNotEmpty();
        mvc.perform(get("/v1/admin/verification/" + realReq).cookie(demoAdmin)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/admin/verification/" + SEED_PENDING).cookie(demoAdmin))
                .andExpect(content().json("{\"userDisplayName\":\"Sample traveller Ana\"}", JsonCompareMode.LENIENT));

        // Read-only: every write is refused, even on demo rows.
        decide(demoAdmin, SEED_PENDING, "approve", null).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"read_only_demo\"}", JsonCompareMode.STRICT));
        decide(demoAdmin, demoReq, "reject", "nope").andExpect(status().isForbidden());
        submit(demoAdmin, "passport").andExpect(status().isForbidden());
        assertThat(jdbc.sql("SELECT status::text FROM verification_requests WHERE id = :id")
                .param("id", SEED_PENDING).query(String.class).single()).isEqualTo("pending");

        JsonNode audit = body(mvc.perform(get("/v1/admin/audit").cookie(demoAdmin)).andExpect(status().isOk()));
        assertThat(audit.get("items")).isNotEmpty();
        for (JsonNode n : audit.get("items")) {
            assertThat(jdbc.sql("SELECT is_demo FROM admin_audit_log WHERE id = :id")
                    .param("id", UUID.fromString(n.get("id").asString())).query(Boolean.class).single()).isTrue();
        }
        // Seeded audit rows name the simulated person whose request was decided.
        assertThat(audit.get("items").valueStream().map(n -> n.path("target").asString("")).toList())
                .contains("Sample traveller Mei", "Sample guide Lucas");
    }

    @Test
    void realAdminSeesOnlyRealRows() throws Exception {
        var admin = accounts.realAdmin("Owner three");
        submit(accounts.demo("guide"), "passport").andExpect(status().isOk());
        var realUser = accounts.real("Real two", "guide");
        submit(realUser.cookie(), "national_id").andExpect(status().isOk());

        for (String s : List.of("pending", "verified", "rejected")) {
            for (String id : queueIds(admin.cookie(), s)) {
                assertThat(jdbc.sql("SELECT is_demo FROM verification_requests WHERE id = :id")
                        .param("id", UUID.fromString(id)).query(Boolean.class).single()).isFalse();
            }
        }
        assertThat(queueIds(admin.cookie(), "pending")).doesNotContain(SEED_PENDING.toString());
        // A demo row cannot be seen or decided by a real admin.
        mvc.perform(get("/v1/admin/verification/" + SEED_PENDING).cookie(admin.cookie()))
                .andExpect(status().isNotFound());
        decide(admin.cookie(), SEED_PENDING, "approve", null).andExpect(status().isNotFound());
        JsonNode audit = body(mvc.perform(get("/v1/admin/audit").cookie(admin.cookie())).andExpect(status().isOk()));
        for (JsonNode n : audit.get("items")) {
            assertThat(jdbc.sql("SELECT is_demo FROM admin_audit_log WHERE id = :id")
                    .param("id", UUID.fromString(n.get("id").asString())).query(Boolean.class).single()).isFalse();
        }
        // A real admin is not a member: no verification of their own.
        submit(admin.cookie(), "passport").andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"forbidden\"}", JsonCompareMode.STRICT));
    }

    @Test
    void membersCannotUseAdminEndpoints() throws Exception {
        var guide = accounts.real("Guide only", "guide");
        for (Cookie c : List.of(guide.cookie(), accounts.demo("traveller"), accounts.demo("guide"))) {
            mvc.perform(get("/v1/admin/verification?status=pending").cookie(c)).andExpect(status().isForbidden());
            mvc.perform(get("/v1/admin/verification/" + SEED_PENDING).cookie(c)).andExpect(status().isForbidden());
            mvc.perform(get("/v1/admin/audit").cookie(c)).andExpect(status().isForbidden());
            decide(c, SEED_PENDING, "approve", null).andExpect(status().isForbidden())
                    .andExpect(content().json("{\"error\":\"forbidden\"}", JsonCompareMode.STRICT));
        }
        mvc.perform(get("/v1/admin/audit")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/verification/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/verification?status=everything").cookie(accounts.demo("admin")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cleanupRemovesOldRejectionsAndDemoVisitorRowsButKeepsSeedsAndAdmins() throws Exception {
        var user = accounts.real("Old reject", "guide");
        var admin = accounts.realAdmin("Owner four");
        submit(user.cookie(), "passport").andExpect(status().isOk());
        UUID req = jdbc.sql("SELECT id FROM verification_requests WHERE user_id = :u")
                .param("u", user.userId()).query(UUID.class).single();
        decide(admin.cookie(), req, "reject", "Simulated reason").andExpect(status().isOk());
        jdbc.sql("UPDATE verification_requests SET decided_at = now() - interval '31 days' WHERE id = :id")
                .param("id", req).update();

        submit(accounts.demo("guide"), "passport").andExpect(status().isOk());
        jdbc.sql("""
                UPDATE verification_requests SET created_at = now() - interval '25 hours'
                WHERE user_id = :u AND NOT is_seed""").param("u", DEMO_GUIDE).update();
        jdbc.sql("UPDATE verification_requests SET created_at = now() - interval '400 days' WHERE is_seed").update();

        service.purge();
        assertThat(jdbc.sql("SELECT count(*) FROM verification_requests WHERE id = :id")
                .param("id", req).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM verification_requests WHERE user_id = :u AND NOT is_seed")
                .param("u", DEMO_GUIDE).query(Integer.class).single()).isZero();
        // Four M3 sample people, the demo traveller and five M4 sample applicants.
        assertThat(jdbc.sql("SELECT count(*) FROM verification_requests WHERE is_seed")
                .query(Integer.class).single()).isEqualTo(10);
        // The audit row of the deleted request stays, without the person's name.
        assertThat(jdbc.sql("SELECT count(*) FROM admin_audit_log WHERE target_id = :t")
                .param("t", req).query(Integer.class).single()).isOne();
        JsonNode audit = body(mvc.perform(get("/v1/admin/audit").cookie(admin.cookie())).andExpect(status().isOk()));
        JsonNode row = audit.get("items").valueStream()
                .filter(n -> n.get("targetId").asString().equals(req.toString())).findFirst().orElseThrow();
        assertThat(row.path("target").isMissingNode() || row.path("target").isNull()).isTrue();
    }

    @Test
    void inactiveAccountPurgeCascadesToRequestsButSparesAdmins(
            @Autowired com.plinthwell.roaamm.passkey.AccountService accountService) throws Exception {
        var user = accounts.real("Gone soon", "traveller");
        var admin = accounts.realAdmin("Away owner");
        submit(user.cookie(), "passport").andExpect(status().isOk());
        jdbc.sql("UPDATE users SET last_active_at = now() - interval '100 days' WHERE id IN (:a, :b)")
                .param("a", user.userId()).param("b", admin.userId()).update();
        accountService.purge();
        assertThat(jdbc.sql("SELECT count(*) FROM verification_requests WHERE user_id = :u")
                .param("u", user.userId()).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE id = :u")
                .param("u", user.userId()).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE id = :u")
                .param("u", admin.userId()).query(Integer.class).single()).isOne();
    }

    @Test
    void signupStillCannotCreateAnAdmin() throws Exception {
        mvc.perform(browser(post("/v1/auth/register/options"))
                        .content("{\"displayName\":\"Sneaky\",\"role\":\"admin\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_role\"}", JsonCompareMode.STRICT));
        // Sample users can never sign in through demo login.
        mvc.perform(get("/v1/me").cookie(accounts.demo("traveller")))
                .andExpect(content().json("{\"displayName\":\"Demo traveller\"}", JsonCompareMode.LENIENT));
    }
}
