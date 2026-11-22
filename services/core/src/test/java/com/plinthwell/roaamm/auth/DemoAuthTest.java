package com.plinthwell.roaamm.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.support.PostgresTest;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@Import(DemoAuthTest.WriteEndpoint.class)
class DemoAuthTest extends PostgresTest {

    static final String WEB = "https://roaamm.plinthwell.com";

    /** Stand-in for future write endpoints, to prove the read-only guard covers them. */
    @TestConfiguration
    @RestController
    static class WriteEndpoint {
        @PostMapping("/v1/test/write")
        Map<String, String> write() {
            return Map.of("written", "yes");
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    static MockHttpServletRequestBuilder browserPost(String path) {
        return post(path).header("Origin", WEB).header(CsrfFilter.HEADER, "1");
    }

    Cookie login(String role) throws Exception {
        MvcResult r = mvc.perform(browserPost("/v1/demo/session")
                        .header(ClientIp.HEADER, "198.51.100." + role.length())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"" + role + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie c = r.getResponse().getCookie(SessionCookie.NAME);
        assertThat(c).isNotNull();
        return c;
    }

    @Test
    void demoSessionSetsAHardenedCookieAndReturnsTheUser() throws Exception {
        MvcResult r = mvc.perform(browserPost("/v1/demo/session")
                        .header(ClientIp.HEADER, "198.51.100.1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"traveller\"}"))
                .andExpect(status().isOk())
                .andExpect(content().json(
                        "{\"role\":\"traveller\",\"displayName\":\"Demo traveller\",\"isDemo\":true}",
                        JsonCompareMode.STRICT))
                .andReturn();
        String setCookie = r.getResponse().getHeader("Set-Cookie");
        assertThat(setCookie)
                .startsWith("__Host-roaamm_session=")
                .contains("Path=/", "Secure", "HttpOnly", "SameSite=Lax", "Max-Age=28800")
                .doesNotContain("Domain=");
        String token = r.getResponse().getCookie(SessionCookie.NAME).getValue();
        assertThat(token).hasSize(43).matches("[A-Za-z0-9_-]+");

        // Only the hash is stored, never the token.
        byte[] stored = jdbc.sql("SELECT token_hash FROM sessions WHERE token_hash = :h")
                .param("h", SessionTokens.hash(token)).query(byte[].class).single();
        assertThat(stored).hasSize(32);
        assertThat(jdbc.sql("SELECT count(*) FROM sessions WHERE encode(token_hash, 'escape') LIKE :t")
                .param("t", "%" + token + "%").query(Integer.class).single()).isZero();
    }

    @Test
    void meReturnsTheUserOr401() throws Exception {
        mvc.perform(get("/v1/me")).andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"error\":\"unauthenticated\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/v1/me").cookie(new Cookie(SessionCookie.NAME, "garbage")))
                .andExpect(status().isUnauthorized());

        Cookie c = login("guide");
        mvc.perform(get("/v1/me").cookie(c))
                .andExpect(status().isOk())
                .andExpect(content().json(
                        "{\"role\":\"guide\",\"displayName\":\"Demo guide\",\"isDemo\":true}", JsonCompareMode.STRICT));
    }

    @Test
    void logoutDeletesTheSessionAndClearsTheCookie() throws Exception {
        Cookie c = login("traveller");
        MvcResult r = mvc.perform(browserPost("/v1/logout").cookie(c))
                .andExpect(status().isNoContent())
                .andReturn();
        assertThat(r.getResponse().getHeader("Set-Cookie")).startsWith("__Host-roaamm_session=;").contains("Max-Age=0");
        mvc.perform(get("/v1/me").cookie(c)).andExpect(status().isUnauthorized());
    }

    @Test
    void expiredSessionsAreRejectedAndPurged() throws Exception {
        Cookie c = login("traveller");
        jdbc.sql("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = :h")
                .param("h", SessionTokens.hash(c.getValue())).update();
        mvc.perform(get("/v1/me").cookie(c)).andExpect(status().isUnauthorized());

        login("traveller"); // creating a session purges expired ones
        assertThat(jdbc.sql("SELECT count(*) FROM sessions WHERE expires_at <= now()")
                .query(Integer.class).single()).isZero();
    }

    @Test
    void rejectsUnknownRoles() throws Exception {
        for (String body : new String[] {"{\"role\":\"root\"}", "{}", "{\"role\":\"Admin\"}"}) {
            mvc.perform(browserPost("/v1/demo/session").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"invalid_role\"}", JsonCompareMode.STRICT));
        }
        mvc.perform(browserPost("/v1/demo/session").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"bad_request\"}", JsonCompareMode.STRICT));
    }

    @Test
    void stateChangingRequestsNeedTheWebOriginAndTheCsrfHeader() throws Exception {
        String body = "{\"role\":\"traveller\"}";
        // No Origin, wrong Origin, look-alike Origin, missing header, wrong header value.
        var attempts = new MockHttpServletRequestBuilder[] {
                post("/v1/demo/session").header(CsrfFilter.HEADER, "1"),
                post("/v1/demo/session").header("Origin", "https://evil.example").header(CsrfFilter.HEADER, "1"),
                post("/v1/demo/session").header("Origin", WEB + ".evil.example").header(CsrfFilter.HEADER, "1"),
                post("/v1/demo/session").header("Origin", WEB),
                post("/v1/demo/session").header("Origin", WEB).header(CsrfFilter.HEADER, "yes"),
                post("/v1/logout").header("Origin", "https://evil.example").header(CsrfFilter.HEADER, "1"),
        };
        for (var a : attempts) {
            mvc.perform(a.contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isForbidden())
                    .andExpect(content().json("{\"error\":\"csrf_rejected\"}", JsonCompareMode.STRICT))
                    .andExpect(header().doesNotExist("Set-Cookie"));
        }
    }

    @Test
    void adminDemoCannotWrite() throws Exception {
        Cookie admin = login("admin");
        mvc.perform(get("/v1/me").cookie(admin)).andExpect(status().isOk());
        mvc.perform(browserPost("/v1/test/write").cookie(admin))
                .andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"read_only_demo\"}", JsonCompareMode.STRICT));

        Cookie traveller = login("traveller");
        mvc.perform(browserPost("/v1/test/write").cookie(traveller)).andExpect(status().isOk());

        // Signing out still works for the admin demo.
        mvc.perform(browserPost("/v1/logout").cookie(admin)).andExpect(status().isNoContent());
    }

    @Test
    void readyChecksTheDatabase() throws Exception {
        mvc.perform(get("/ready"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"ok\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"ok\"}", JsonCompareMode.STRICT));
    }

    @Test
    void errorsAreSmallJsonWithoutStackTraces() throws Exception {
        MvcResult r = mvc.perform(get("/v1/demo/session")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(405);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Exception", "at com.", "at org.");
    }
}
