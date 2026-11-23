package com.plinthwell.roaamm.passkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.CsrfFilter;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.SoftAuthenticator;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Import(PasskeyFlowTest.WriteEndpoint.class)
class PasskeyFlowTest extends PostgresTest {

    static final String WEB = "https://roaamm.plinthwell.com";
    static final String RP = "roaamm.plinthwell.com";

    @TestConfiguration
    @RestController
    static class WriteEndpoint {
        @PostMapping("/v1/test/passkey-write")
        Map<String, String> write() {
            return Map.of("written", "yes");
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ObjectMapper json;

    @Autowired
    AccountService accounts;

    /** A fresh IP per test keeps the per-IP limits out of the way. */
    String ip;

    @BeforeEach
    void newIp() {
        ip = "10." + ThreadLocalRandom.current().nextInt(256) + "." + ThreadLocalRandom.current().nextInt(256) + "."
                + ThreadLocalRandom.current().nextInt(1, 255);
    }

    MockHttpServletRequestBuilder browser(MockHttpServletRequestBuilder b) {
        return b.header("Origin", WEB).header(CsrfFilter.HEADER, "1").header(ClientIp.HEADER, ip)
                .contentType(MediaType.APPLICATION_JSON);
    }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    ResultActions registerOptions(String name, String role) throws Exception {
        return mvc.perform(browser(post("/v1/auth/register/options"))
                .content(json.writeValueAsString(Map.of("displayName", name, "role", role))));
    }

    ResultActions verify(String path, String challengeId, String credentialJson, Cookie cookie) throws Exception {
        var b = browser(post(path)).content("{\"challengeId\":\"" + challengeId + "\",\"credential\":"
                + credentialJson + "}");
        if (cookie != null) {
            b.cookie(cookie);
        }
        return mvc.perform(b);
    }

    record Account(SoftAuthenticator key, Cookie cookie, List<String> codes) {}

    Account signUp(String name, String role) throws Exception {
        JsonNode opts = body(registerOptions(name, role).andExpect(status().isOk()));
        var key = new SoftAuthenticator();
        String cred = key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                opts.at("/publicKey/user/id").asString());
        MvcResult r = verify("/v1/auth/register/verify", opts.get("challengeId").asString(), cred, null)
                .andExpect(status().isOk()).andReturn();
        JsonNode b = json.readTree(r.getResponse().getContentAsString());
        List<String> codes = b.get("recoveryCodes").valueStream().map(JsonNode::asString).toList();
        return new Account(key, r.getResponse().getCookie(SessionCookie.NAME), codes);
    }

    ResultActions login(SoftAuthenticator key) throws Exception {
        JsonNode opts = body(mvc.perform(browser(post("/v1/auth/login/options"))).andExpect(status().isOk()));
        return verify("/v1/auth/login/verify", opts.get("challengeId").asString(),
                key.get(opts.at("/publicKey/challenge").asString(), RP, WEB), null);
    }

    void reauth(Account a) throws Exception {
        JsonNode opts = body(mvc.perform(browser(post("/v1/me/reauth/options")).cookie(a.cookie()))
                .andExpect(status().isOk()));
        verify("/v1/me/reauth/verify", opts.get("challengeId").asString(),
                a.key().get(opts.at("/publicKey/challenge").asString(), RP, WEB), a.cookie())
                .andExpect(status().isNoContent());
    }

    @Test
    void registerLoginLogoutRoundTrip() throws Exception {
        JsonNode opts = body(registerOptions("  Asha   Rao ", "traveller").andExpect(status().isOk()));
        assertThat(opts.at("/publicKey/rp/id").asString()).isEqualTo(RP);
        assertThat(opts.at("/publicKey/attestation").asString()).isEqualTo("none");
        assertThat(opts.at("/publicKey/authenticatorSelection/residentKey").asString()).isEqualTo("required");
        assertThat(opts.at("/publicKey/authenticatorSelection/userVerification").asString()).isEqualTo("required");
        assertThat(opts.at("/publicKey/timeout").asLong()).isEqualTo(300_000);
        assertThat(java.util.Base64.getUrlDecoder().decode(opts.at("/publicKey/user/id").asString())).hasSize(64);
        assertThat(opts.at("/publicKey/user/name").asString()).isEqualTo("Asha Rao");

        var key = new SoftAuthenticator();
        String cred = key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                opts.at("/publicKey/user/id").asString());
        MvcResult r = verify("/v1/auth/register/verify", opts.get("challengeId").asString(), cred, null)
                .andExpect(status().isOk()).andReturn();
        JsonNode created = json.readTree(r.getResponse().getContentAsString());
        assertThat(created.get("role").asString()).isEqualTo("traveller");
        assertThat(created.get("displayName").asString()).isEqualTo("Asha Rao");
        assertThat(created.get("isDemo").asBoolean()).isFalse();
        List<String> codes = created.get("recoveryCodes").valueStream().map(JsonNode::asString).toList();
        assertThat(codes).hasSize(8).doesNotHaveDuplicates()
                .allMatch(c -> c.matches("[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}(-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}){3}"));
        assertThat(r.getResponse().getHeader("Set-Cookie")).startsWith("__Host-roaamm_session=")
                .contains("HttpOnly", "Secure", "SameSite=Lax");
        // Codes are stored only as hashes.
        assertThat(jdbc.sql("SELECT count(*) FROM recovery_codes WHERE encode(code_hash, 'escape') LIKE :c")
                .param("c", "%" + codes.get(0).replace("-", "") + "%").query(Integer.class).single()).isZero();

        Cookie cookie = r.getResponse().getCookie(SessionCookie.NAME);
        mvc.perform(get("/v1/me").cookie(cookie)).andExpect(status().isOk()).andExpect(content().json(
                "{\"role\":\"traveller\",\"displayName\":\"Asha Rao\",\"isDemo\":false,\"needsNewPasskey\":false}",
                JsonCompareMode.STRICT));
        // Real users can write.
        mvc.perform(browser(post("/v1/test/passkey-write")).cookie(cookie)).andExpect(status().isOk());

        mvc.perform(browser(post("/v1/logout")).cookie(cookie)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/me").cookie(cookie)).andExpect(status().isUnauthorized());

        MvcResult in = login(key).andExpect(status().isOk()).andReturn();
        Cookie again = in.getResponse().getCookie(SessionCookie.NAME);
        assertThat(json.readTree(in.getResponse().getContentAsString()).has("recoveryCodes")).isTrue();
        assertThat(json.readTree(in.getResponse().getContentAsString()).get("recoveryCodes").isNull()).isTrue();
        mvc.perform(get("/v1/me").cookie(again)).andExpect(status().isOk());
    }

    @Test
    void signupRejectsAdminAndBadInput() throws Exception {
        for (String role : new String[] {"admin", "root", "Traveller", ""}) {
            registerOptions("Asha", role).andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"invalid_role\"}", JsonCompareMode.STRICT));
        }
        for (String name : new String[] {"", "   ", "<b>x</b>", "a&b", "x".repeat(41), "tab\tname\u0000"}) {
            registerOptions(name, "guide").andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"invalid_display_name\"}", JsonCompareMode.STRICT));
        }
        registerOptions("x".repeat(40), "guide").andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE NOT is_demo AND role = 'admin'")
                .query(Integer.class).single()).isZero();
    }

    @Test
    void registrationChecksOriginChallengeAndUserVerification() throws Exception {
        // Origin: the API host is not the web origin.
        JsonNode opts = body(registerOptions("Ravi", "guide"));
        var key = new SoftAuthenticator();
        String wrongOrigin = key.create(opts.at("/publicKey/challenge").asString(), RP,
                "https://roaamm-api.plinthwell.com", opts.at("/publicKey/user/id").asString());
        verify("/v1/auth/register/verify", opts.get("challengeId").asString(), wrongOrigin, null)
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"passkey_not_accepted\"}", JsonCompareMode.STRICT));
        // That challenge is gone now, even though verification failed.
        String good = key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                opts.at("/publicKey/user/id").asString());
        verify("/v1/auth/register/verify", opts.get("challengeId").asString(), good, null)
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"challenge_expired\"}", JsonCompareMode.STRICT));

        // Wrong rpId.
        opts = body(registerOptions("Ravi", "guide"));
        verify("/v1/auth/register/verify", opts.get("challengeId").asString(),
                key.create(opts.at("/publicKey/challenge").asString(), "evil.example", WEB,
                        opts.at("/publicKey/user/id").asString()), null)
                .andExpect(status().isBadRequest());

        // No user verification.
        opts = body(registerOptions("Ravi", "guide"));
        var noUv = new SoftAuthenticator();
        noUv.userVerified = false;
        verify("/v1/auth/register/verify", opts.get("challengeId").asString(),
                noUv.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                        opts.at("/publicKey/user/id").asString()), null)
                .andExpect(status().isBadRequest());

        // Expired challenge.
        opts = body(registerOptions("Ravi", "guide"));
        jdbc.sql("UPDATE webauthn_challenges SET expires_at = now() - interval '1 second' WHERE id = :id")
                .param("id", java.util.UUID.fromString(opts.get("challengeId").asString())).update();
        verify("/v1/auth/register/verify", opts.get("challengeId").asString(),
                key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                        opts.at("/publicKey/user/id").asString()), null)
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"challenge_expired\"}", JsonCompareMode.STRICT));

        // A login challenge cannot finish a registration.
        JsonNode login = body(mvc.perform(browser(post("/v1/auth/login/options"))));
        verify("/v1/auth/register/verify", login.get("challengeId").asString(),
                key.create(login.at("/publicKey/challenge").asString(), RP, WEB,
                        opts.at("/publicKey/user/id").asString()), null)
                .andExpect(status().isBadRequest());
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE display_name = 'Ravi'")
                .query(Integer.class).single()).isZero();
    }

    @Test
    void loginErrorsAreGenericAndChallengesSingleUse() throws Exception {
        Account a = signUp("Meera", "guide");
        // A passkey the server never saw.
        login(unknownKey()).andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"error\":\"passkey_not_accepted\"}", JsonCompareMode.STRICT));

        // Reusing a login challenge.
        JsonNode opts = body(mvc.perform(browser(post("/v1/auth/login/options"))));
        String assertion = a.key().get(opts.at("/publicKey/challenge").asString(), RP, WEB);
        verify("/v1/auth/login/verify", opts.get("challengeId").asString(), assertion, null)
                .andExpect(status().isOk());
        verify("/v1/auth/login/verify", opts.get("challengeId").asString(), assertion, null)
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"challenge_expired\"}", JsonCompareMode.STRICT));

        // Wrong origin on sign-in.
        opts = body(mvc.perform(browser(post("/v1/auth/login/options"))));
        verify("/v1/auth/login/verify", opts.get("challengeId").asString(),
                a.key().get(opts.at("/publicKey/challenge").asString(), RP, "https://evil.example"), null)
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"error\":\"passkey_not_accepted\"}", JsonCompareMode.STRICT));
    }

    /** Unknown to the server: signs fine, but no account owns it. */
    static SoftAuthenticator unknownKey() {
        var key = new SoftAuthenticator();
        key.create("AAAA", RP, WEB, java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[64]));
        return key;
    }

    @Test
    void signCountZeroIsFineButADecreaseFails() throws Exception {
        Account a = signUp("Kiran", "traveller");
        // Synced passkeys always report 0.
        login(a.key()).andExpect(status().isOk());
        login(a.key()).andExpect(status().isOk());

        // A counting authenticator: 5, then 5 again (allowed), then 3 (refused).
        for (long count : new long[] {5, 5}) {
            JsonNode opts = body(mvc.perform(browser(post("/v1/auth/login/options"))));
            verify("/v1/auth/login/verify", opts.get("challengeId").asString(),
                    a.key().getWithCount(opts.at("/publicKey/challenge").asString(), RP, WEB, count), null)
                    .andExpect(status().isOk());
        }
        JsonNode opts = body(mvc.perform(browser(post("/v1/auth/login/options"))));
        verify("/v1/auth/login/verify", opts.get("challengeId").asString(),
                a.key().getWithCount(opts.at("/publicKey/challenge").asString(), RP, WEB, 3), null)
                .andExpect(status().isUnauthorized());
    }

    @Test
    void recoveryCodeSignsInOnceAndRequiresANewPasskey() throws Exception {
        Account a = signUp("Lena", "traveller");
        String code = a.codes().get(3).toLowerCase().replace("-", " ");
        MvcResult r = mvc.perform(browser(post("/v1/auth/recovery")).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(r.getResponse().getContentAsString()).get("needsNewPasskey").asBoolean()).isTrue();
        Cookie recovered = r.getResponse().getCookie(SessionCookie.NAME);
        mvc.perform(get("/v1/me").cookie(recovered))
                .andExpect(content().json("{\"needsNewPasskey\":true}", JsonCompareMode.LENIENT));

        // Single use.
        mvc.perform(browser(post("/v1/auth/recovery")).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"error\":\"recovery_code_not_accepted\"}", JsonCompareMode.STRICT));
        mvc.perform(browser(post("/v1/auth/recovery")).content("{\"code\":\"nonsense\"}"))
                .andExpect(status().isUnauthorized());

        // A recovery sign-in is not a fresh passkey check.
        mvc.perform(browser(post("/v1/me/recovery-codes/regenerate")).cookie(recovered))
                .andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"reauth_required\"}", JsonCompareMode.STRICT));

        // Adding a new passkey clears the flag.
        JsonNode opts = body(mvc.perform(browser(post("/v1/me/credentials/options")).cookie(recovered))
                .andExpect(status().isOk()));
        assertThat(opts.at("/publicKey/excludeCredentials/0/id").asString()).isEqualTo(a.key().credentialIdB64());
        var second = new SoftAuthenticator();
        mvc.perform(browser(post("/v1/me/credentials/verify")).cookie(recovered).content(
                        "{\"challengeId\":\"" + opts.get("challengeId").asString() + "\",\"label\":\"New phone\","
                                + "\"credential\":" + second.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                                        opts.at("/publicKey/user/id").asString()) + "}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/v1/me").cookie(recovered))
                .andExpect(content().json("{\"needsNewPasskey\":false}", JsonCompareMode.LENIENT));
        JsonNode list = body(mvc.perform(get("/v1/me/credentials").cookie(recovered)).andExpect(status().isOk()));
        assertThat(list.get("credentials")).hasSize(2);
        assertThat(list.get("recoveryCodesRemaining").asInt()).isEqualTo(7);
        assertThat(list.at("/credentials/1/label").asString()).isEqualTo("New phone");

        // The new passkey signs in.
        login(second).andExpect(status().isOk());
    }

    @Test
    void deletingAndRegeneratingNeedAFreshCheck() throws Exception {
        Account a = signUp("Omar", "guide");
        String id = a.key().credentialIdB64();
        // Sign-up counts as fresh: regenerate works straight away.
        JsonNode regen = body(mvc.perform(browser(post("/v1/me/recovery-codes/regenerate")).cookie(a.cookie()))
                .andExpect(status().isOk()));
        assertThat(regen.get("recoveryCodes")).hasSize(8);
        // Old codes no longer work.
        mvc.perform(browser(post("/v1/auth/recovery")).content("{\"code\":\"" + a.codes().get(0) + "\"}"))
                .andExpect(status().isUnauthorized());

        jdbc.sql("UPDATE sessions SET fresh_auth_at = now() - interval '10 minutes' WHERE user_id ="
                + " (SELECT user_id FROM webauthn_credentials WHERE id = :id)")
                .param("id", java.util.Base64.getUrlDecoder().decode(id)).update();
        mvc.perform(browser(delete("/v1/me/credentials/" + id)).cookie(a.cookie()))
                .andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"reauth_required\"}", JsonCompareMode.STRICT));

        reauth(a);
        // Last passkey, but unused recovery codes exist: allowed.
        mvc.perform(browser(delete("/v1/me/credentials/" + id)).cookie(a.cookie()))
                .andExpect(status().isNoContent());
        mvc.perform(browser(delete("/v1/me/credentials/" + id)).cookie(a.cookie()))
                .andExpect(status().isNotFound());
    }

    @Test
    void neverDeletesTheLastPasskeyWithoutRecoveryCodes() throws Exception {
        Account a = signUp("Ines", "traveller");
        jdbc.sql("UPDATE recovery_codes SET used_at = now() WHERE user_id ="
                + " (SELECT user_id FROM webauthn_credentials WHERE id = :id)")
                .param("id", a.key().credentialId).update();
        mvc.perform(browser(delete("/v1/me/credentials/" + a.key().credentialIdB64())).cookie(a.cookie()))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"last_passkey\"}", JsonCompareMode.STRICT));
        login(a.key()).andExpect(status().isOk());
    }

    @Test
    void demoUsersCannotUseAccountEndpointsButCanSignUp() throws Exception {
        MvcResult demo = mvc.perform(browser(post("/v1/demo/session")).content("{\"role\":\"admin\"}"))
                .andExpect(status().isOk()).andReturn();
        Cookie admin = demo.getResponse().getCookie(SessionCookie.NAME);
        // /v1/me for demo users is unchanged.
        mvc.perform(get("/v1/me").cookie(admin)).andExpect(content().json(
                "{\"role\":\"admin\",\"displayName\":\"Demo admin\",\"isDemo\":true}", JsonCompareMode.STRICT));
        mvc.perform(get("/v1/me/credentials").cookie(admin)).andExpect(status().isForbidden());
        mvc.perform(browser(post("/v1/me/reauth/options")).cookie(admin)).andExpect(status().isForbidden());
        mvc.perform(browser(post("/v1/test/passkey-write")).cookie(admin)).andExpect(status().isForbidden());

        // Signing up from a demo session replaces it with the new account's session.
        JsonNode opts = body(mvc.perform(browser(post("/v1/auth/register/options")).cookie(admin)
                .content("{\"displayName\":\"From demo\",\"role\":\"guide\"}")).andExpect(status().isOk()));
        var key = new SoftAuthenticator();
        MvcResult r = verify("/v1/auth/register/verify", opts.get("challengeId").asString(),
                key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                        opts.at("/publicKey/user/id").asString()), admin)
                .andExpect(status().isOk()).andReturn();
        mvc.perform(get("/v1/me").cookie(admin)).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/me").cookie(r.getResponse().getCookie(SessionCookie.NAME)))
                .andExpect(content().json("{\"isDemo\":false,\"role\":\"guide\"}", JsonCompareMode.LENIENT));
    }

    @Test
    void inactiveRealAccountsArePurgedAndDemoUsersAreNot() throws Exception {
        Account a = signUp("Old", "traveller");
        jdbc.sql("UPDATE users SET last_active_at = now() - interval '91 days' WHERE NOT is_demo"
                + " AND id = (SELECT user_id FROM webauthn_credentials WHERE id = :id)")
                .param("id", a.key().credentialId).update();
        jdbc.sql("UPDATE users SET last_active_at = now() - interval '400 days' WHERE is_demo").update();
        accounts.purge();
        assertThat(jdbc.sql("SELECT count(*) FROM webauthn_credentials WHERE id = :id")
                .param("id", a.key().credentialId).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM users WHERE is_demo AND NOT is_sample").query(Integer.class).single())
                .isEqualTo(3);
        login(a.key()).andExpect(status().isUnauthorized());
    }

    @Test
    void nothingSecretIsStoredInPlainText() throws Exception {
        Account a = signUp("Plain", "guide");
        // No IP, email or phone columns exist on users.
        List<String> columns = jdbc.sql("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")
                .query(String.class).list();
        assertThat(columns).containsExactlyInAnyOrder("id", "role", "display_name", "is_demo", "created_at",
                "user_handle", "last_active_at", "is_sample");
        assertThat(a.codes()).isNotEmpty();
    }
}
