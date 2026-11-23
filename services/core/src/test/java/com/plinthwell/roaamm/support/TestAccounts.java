package com.plinthwell.roaamm.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.CsrfFilter;
import com.plinthwell.roaamm.auth.SessionCookie;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Signs people in for integration tests: demo sessions, real passkey accounts, and a promoted admin. */
public final class TestAccounts {

    public static final String WEB = "https://roaamm.plinthwell.com";
    public static final String RP = "roaamm.plinthwell.com";

    public record Account(UUID userId, Cookie cookie) {}

    private final MockMvc mvc;
    private final ObjectMapper json;
    private final JdbcClient jdbc;

    public TestAccounts(MockMvc mvc, ObjectMapper json, JdbcClient jdbc) {
        this.mvc = mvc;
        this.json = json;
        this.jdbc = jdbc;
    }

    public static String randomIp() {
        var r = ThreadLocalRandom.current();
        return "10." + r.nextInt(256) + "." + r.nextInt(256) + "." + r.nextInt(1, 255);
    }

    public static MockHttpServletRequestBuilder browser(MockHttpServletRequestBuilder b) {
        return b.header("Origin", WEB).header(CsrfFilter.HEADER, "1").header(ClientIp.HEADER, randomIp())
                .contentType(MediaType.APPLICATION_JSON);
    }

    public Cookie demo(String role) throws Exception {
        return mvc.perform(browser(post("/v1/demo/session")).content("{\"role\":\"" + role + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie(SessionCookie.NAME);
    }

    public Account real(String name, String role) throws Exception {
        JsonNode opts = json.readTree(mvc.perform(browser(post("/v1/auth/register/options"))
                        .content(json.writeValueAsString(Map.of("displayName", name, "role", role))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var key = new SoftAuthenticator();
        MvcResult r = mvc.perform(browser(post("/v1/auth/register/verify")).content(
                        "{\"challengeId\":\"" + opts.get("challengeId").asString() + "\",\"credential\":"
                                + key.create(opts.at("/publicKey/challenge").asString(), RP, WEB,
                                        opts.at("/publicKey/user/id").asString()) + "}"))
                .andExpect(status().isOk()).andReturn();
        UUID id = jdbc.sql("SELECT user_id FROM webauthn_credentials WHERE id = :id")
                .param("id", key.credentialId).query(UUID.class).single();
        return new Account(id, r.getResponse().getCookie(SessionCookie.NAME));
    }

    /** What docs/runbooks/first-admin.md does by hand in the Neon SQL editor. */
    public Account realAdmin(String name) throws Exception {
        Account a = real(name, "traveller");
        int rows = jdbc.sql("UPDATE users SET role = 'admin' WHERE id = :id AND NOT is_demo")
                .param("id", a.userId()).update();
        if (rows != 1) {
            throw new IllegalStateException("expected one row");
        }
        return a;
    }
}
