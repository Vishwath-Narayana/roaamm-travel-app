package com.plinthwell.roaamm.passkey;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.CsrfFilter;
import com.plinthwell.roaamm.support.PostgresTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@TestPropertySource(properties = {
    "roaamm.passkey.max-real-accounts=0",
    "roaamm.auth-rate-limit.max-per-window=3",
    "roaamm.recovery-rate-limit.max-per-window=2",
})
class PasskeyLimitsTest extends PostgresTest {

    @Autowired
    MockMvc mvc;

    MockHttpServletRequestBuilder browser(String path, String ip) {
        return post(path).header("Origin", "https://roaamm.plinthwell.com").header(CsrfFilter.HEADER, "1")
                .header(ClientIp.HEADER, ip).contentType(MediaType.APPLICATION_JSON);
    }

    @Test
    void signupsPauseAtTheAccountCap() throws Exception {
        mvc.perform(browser("/v1/auth/register/options", "172.16.0.1")
                        .content("{\"displayName\":\"Asha\",\"role\":\"traveller\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"error\":\"signups_paused\"}", JsonCompareMode.STRICT));
    }

    @Test
    void authEndpointsAreRateLimitedPerIp() throws Exception {
        for (int i = 0; i < 3; i++) {
            mvc.perform(browser("/v1/auth/login/options", "172.16.0.2")).andExpect(status().isOk());
        }
        mvc.perform(browser("/v1/auth/login/options", "172.16.0.2"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(content().json("{\"error\":\"rate_limited\"}", JsonCompareMode.STRICT));
        mvc.perform(browser("/v1/auth/login/options", "172.16.0.3")).andExpect(status().isOk());
    }

    @Test
    void recoveryIsStrictlyRateLimited() throws Exception {
        for (int i = 0; i < 2; i++) {
            mvc.perform(browser("/v1/auth/recovery", "172.16.0.4").content("{\"code\":\"AAAA-BBBB-CCCC-DDDD\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(browser("/v1/auth/recovery", "172.16.0.4").content("{\"code\":\"AAAA-BBBB-CCCC-DDDD\"}"))
                .andExpect(status().isTooManyRequests());
    }
}
