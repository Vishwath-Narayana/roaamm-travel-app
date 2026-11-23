package com.plinthwell.roaamm.passkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.CsrfFilter;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.SoftAuthenticator;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** The shared demo accounts can never gain a passkey or recovery code (ADR 0005). */
class DemoBoundaryTest extends PostgresTest {

    static final String WEB = "https://roaamm.plinthwell.com";
    static final String RP = "roaamm.plinthwell.com";
    static final Map<String, UUID> DEMO = Map.of(
            "traveller", UUID.fromString("00000000-0000-4000-8000-000000000001"),
            "guide", UUID.fromString("00000000-0000-4000-8000-000000000002"),
            "admin", UUID.fromString("00000000-0000-4000-8000-000000000003"));

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ObjectMapper json;

    String ip = "10.99." + ThreadLocalRandom.current().nextInt(256) + "." + ThreadLocalRandom.current().nextInt(1, 255);

    MockHttpServletRequestBuilder browser(MockHttpServletRequestBuilder b) {
        return b.header("Origin", WEB).header(CsrfFilter.HEADER, "1").header(ClientIp.HEADER, ip)
                .contentType(MediaType.APPLICATION_JSON);
    }

    Cookie demo(String role) throws Exception {
        return mvc.perform(browser(post("/v1/demo/session")).content("{\"role\":\"" + role + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie(SessionCookie.NAME);
    }

    int demoSecrets() {
        return jdbc.sql("""
                        SELECT (SELECT count(*) FROM webauthn_credentials c JOIN users u ON u.id = c.user_id
                                WHERE u.is_demo)
                             + (SELECT count(*) FROM recovery_codes r JOIN users u ON u.id = r.user_id
                                WHERE u.is_demo)""")
                .query(Integer.class).single();
    }

    @ParameterizedTest
    @ValueSource(strings = {"traveller", "guide", "admin"})
    void everyCredentialEndpointRefusesDemoUsers(String role) throws Exception {
        Cookie c = demo(role);
        var key = new SoftAuthenticator();
        String fakeCredential = key.create("AAAA", RP, WEB, "AAAA");
        String verifyBody = "{\"challengeId\":\"" + UUID.randomUUID() + "\",\"credential\":" + fakeCredential + "}";
        List<MockHttpServletRequestBuilder> calls = List.of(
                get("/v1/me/credentials"),
                browser(post("/v1/me/credentials/options")),
                browser(post("/v1/me/credentials/verify")).content(verifyBody),
                browser(delete("/v1/me/credentials/" + key.credentialIdB64())),
                browser(post("/v1/me/reauth/options")),
                browser(post("/v1/me/reauth/verify")).content(verifyBody),
                browser(post("/v1/me/recovery-codes/regenerate")));
        for (var call : calls) {
            // 403 either way: not_for_demo, or read_only_demo for the admin demo's writes.
            MvcResult r = mvc.perform(call.cookie(c)).andExpect(status().isForbidden()).andReturn();
            assertThat(r.getResponse().getContentAsString()).matches("\\{\"error\":\"(not_for_demo|read_only_demo)\"}");
        }
        assertThat(demoSecrets()).isZero();
        // The demo session itself still works.
        mvc.perform(get("/v1/me").cookie(c)).andExpect(status().isOk());
    }

    @Test
    void theDatabaseRefusesPasskeysAndCodesOnDemoUsers() {
        for (UUID demoUser : DEMO.values()) {
            assertThatThrownBy(() -> jdbc.sql("""
                            INSERT INTO webauthn_credentials (id, user_id, aaguid, public_key, backup_eligible,
                                backup_state, created_at)
                            VALUES (:id, :user, :aaguid, :pk, false, false, now())""")
                    .param("id", new byte[32]).param("user", demoUser).param("aaguid", new byte[16])
                    .param("pk", new byte[] {1}).update())
                    .hasMessageContaining("demo users cannot hold passkeys");
            assertThatThrownBy(() -> jdbc.sql("""
                            INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
                            VALUES (:id, :user, :hash, now())""")
                    .param("id", UUID.randomUUID()).param("user", demoUser).param("hash", new byte[32]).update())
                    .hasMessageContaining("demo users cannot hold passkeys");
        }
        assertThat(demoSecrets()).isZero();
    }

    @Test
    void signingUpFromADemoSessionReplacesItAndLeavesTheDemoUserAlone() throws Exception {
        UUID demoGuide = DEMO.get("guide");
        String before = demoRow(demoGuide);
        Cookie mine = demo("guide");
        Cookie someoneElse = demo("guide"); // another visitor on the same shared account

        JsonNode opts = json.readTree(mvc.perform(browser(post("/v1/auth/register/options")).cookie(mine)
                        .content("{\"displayName\":\"Was a demo\",\"role\":\"traveller\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var key = new SoftAuthenticator();
        MvcResult r = mvc.perform(browser(post("/v1/auth/register/verify")).cookie(mine).content(
                        "{\"challengeId\":\"" + opts.get("challengeId").asString() + "\",\"credential\":"
                                + key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                                        opts.at("/publicKey/user/id").asString()) + "}"))
                .andExpect(status().isOk()).andReturn();

        // My demo session is gone and replaced by the new account's session.
        assertThat(jdbc.sql("SELECT count(*) FROM sessions WHERE token_hash = :h")
                .param("h", com.plinthwell.roaamm.auth.SessionTokens.hash(mine.getValue()))
                .query(Integer.class).single()).isZero();
        mvc.perform(get("/v1/me").cookie(mine)).andExpect(status().isUnauthorized());
        JsonNode me = json.readTree(mvc.perform(get("/v1/me").cookie(r.getResponse().getCookie(SessionCookie.NAME)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(me.get("isDemo").asBoolean()).isFalse();
        assertThat(me.get("displayName").asString()).isEqualTo("Was a demo");

        // The demo user is untouched: same row, no passkey or codes, other visitors still signed in.
        assertThat(demoRow(demoGuide)).isEqualTo(before);
        assertThat(demoSecrets()).isZero();
        mvc.perform(get("/v1/me").cookie(someoneElse)).andExpect(status().isOk());
        // The passkey belongs to the new user, not to the demo guide.
        UUID owner = jdbc.sql("SELECT user_id FROM webauthn_credentials WHERE id = :id")
                .param("id", key.credentialId).query(UUID.class).single();
        assertThat(owner).isNotIn(DEMO.values());
    }

    @Test
    void signupsPauseAtTheCapEvenAfterOptionsWereIssued() throws Exception {
        // Options come first (cap not reached), then the cap fills before verify.
        JsonNode opts = json.readTree(mvc.perform(browser(post("/v1/auth/register/options"))
                        .content("{\"displayName\":\"Late\",\"role\":\"guide\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        int real = jdbc.sql("SELECT count(*) FROM users WHERE NOT is_demo").query(Integer.class).single();
        int fill = Math.max(0, 300 - real);
        try {
            jdbc.sql("""
                            INSERT INTO users (id, role, display_name, is_demo, user_handle)
                            SELECT gen_random_uuid(), 'traveller', 'Cap filler', false,
                                   decode(md5(random()::text) || md5(random()::text)
                                       || md5(random()::text) || md5(random()::text), 'hex')
                            FROM generate_series(1, :n)""")
                    .param("n", fill).update();
            var key = new SoftAuthenticator();
            mvc.perform(browser(post("/v1/auth/register/verify")).content(
                            "{\"challengeId\":\"" + opts.get("challengeId").asString() + "\",\"credential\":"
                                    + key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                                            opts.at("/publicKey/user/id").asString()) + "}"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                            .json("{\"error\":\"signups_paused\"}"));
            mvc.perform(browser(post("/v1/auth/register/options"))
                            .content("{\"displayName\":\"Later\",\"role\":\"guide\"}"))
                    .andExpect(status().isServiceUnavailable());
            assertThat(jdbc.sql("SELECT count(*) FROM users WHERE display_name = 'Late'")
                    .query(Integer.class).single()).isZero();
        } finally {
            jdbc.sql("DELETE FROM users WHERE display_name = 'Cap filler'").update();
        }
    }

    @Test
    void thePurgeDeletesIdleRealAccountsOnlyAndKeepsDemoSessions() throws Exception {
        Cookie demoSession = demo("traveller");
        String demoBefore = demoRow(DEMO.get("traveller"));
        jdbc.sql("UPDATE users SET last_active_at = now() - interval '5 years' WHERE is_demo").update();
        UUID idle = UUID.randomUUID();
        UUID active = UUID.randomUUID();
        for (UUID id : List.of(idle, active)) {
            jdbc.sql("""
                            INSERT INTO users (id, role, display_name, is_demo, user_handle, last_active_at)
                            VALUES (:id, 'guide', 'Purge check', false,
                                    decode(md5(:id::text) || md5(:id::text) || md5(:id::text) || md5(:id::text), 'hex'),
                                    now() - CAST(:age AS interval))""")
                    .param("id", id).param("age", id.equals(idle) ? "91 days" : "89 days").update();
        }
        accountService.purge();
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE id = :id").param("id", idle)
                .query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE id = :id").param("id", active)
                .query(Integer.class).single()).isOne();
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE is_demo").query(Integer.class).single()).isEqualTo(3);
        mvc.perform(get("/v1/me").cookie(demoSession)).andExpect(status().isOk());
        jdbc.sql("UPDATE users SET last_active_at = now() WHERE is_demo").update();
        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", active).update();
        assertThat(demoRow(DEMO.get("traveller"))).isEqualTo(demoBefore);
    }

    @Autowired
    AccountService accountService;

    /** The fields that define a demo user (last_active_at is not one of them). */
    String demoRow(UUID id) {
        return jdbc.sql("""
                        SELECT role::text || '|' || display_name || '|' || is_demo || '|'
                               || coalesce(encode(user_handle, 'hex'), 'null') || '|' || created_at
                        FROM users WHERE id = :id""")
                .param("id", id).query(String.class).single();
    }
}
