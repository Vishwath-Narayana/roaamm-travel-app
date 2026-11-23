package com.plinthwell.roaamm.passkey;

import com.plinthwell.roaamm.auth.AuthProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PasskeyProperties.class)
@ImportRuntimeHints(WebAuthnRuntimeHints.class)
public class PasskeyConfig {

    /** The expected origin is the web app only, never the API host. */
    @Bean
    PasskeyVerifier passkeyVerifier(AuthProperties auth, PasskeyProperties passkey) {
        return new PasskeyVerifier(auth.webOrigin(), passkey.rpId());
    }
}
